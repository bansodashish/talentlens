import base64
import csv
import html
import hmac
import importlib
import json
import mimetypes
import os
import re
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from config import load_env_files
from scoring import role_library


load_env_files()

from providers import ProviderError, match_with_provider, ssl_status

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
EXAMPLES = ROOT / "examples"

SAMPLE_BATCH_DATASETS = {
    "backend": {
        "label": "Backend Engineer (N26 Acquire)",
        "file": "sample_backend_engineer_acquire_batch.csv",
        "jd_file": "backend_engineer_acquire_jd.txt",
    },
    "qa": {
        "label": "QA Automation Engineer",
        "file": "sample_qa_automation_batch.csv",
        "jd_file": "qa_automation_jd.txt",
    },
}


def parse_multipart_form(fp, headers):
    """Parse multipart/form-data from request using raw boundary splitting.
    The email.message module corrupts binary payloads (PDFs, DOCXs), so we
    split on the raw boundary bytes ourselves."""
    content_type = headers.get("Content-Type", "")
    if not content_type.startswith("multipart/form-data"):
        return {}

    # Extract boundary from Content-Type header
    boundary = None
    for part in content_type.split(";"):
        part = part.strip()
        if part.startswith("boundary="):
            boundary = part[len("boundary="):].strip().strip('"')
            break
    if not boundary:
        return {}

    content_length = int(headers.get("Content-Length", 0))
    if content_length == 0:
        return {}

    body = fp.read(content_length)

    # Split on boundary (RFC 2046: boundary is preceded by CRLF--)
    delim = ("--" + boundary).encode()
    parts = body.split(delim)

    form = {}
    for raw_part in parts[1:]:  # skip preamble before first boundary
        # Strip leading CRLF, skip terminating "--"
        if raw_part.startswith(b"--"):
            break
        if raw_part.startswith(b"\r\n"):
            raw_part = raw_part[2:]

        # Split headers from body on blank line
        if b"\r\n\r\n" not in raw_part:
            continue
        header_block, _, content = raw_part.partition(b"\r\n\r\n")
        # Strip trailing CRLF that belongs to the next boundary delimiter
        if content.endswith(b"\r\n"):
            content = content[:-2]

        # Parse part headers
        part_headers = {}
        for line in header_block.decode("utf-8", errors="replace").splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                part_headers[k.strip().lower()] = v.strip()

        disposition = part_headers.get("content-disposition", "")
        name_m = re.search(r'name="([^"]*)"', disposition)
        if not name_m:
            continue
        name = name_m.group(1)
        filename_m = re.search(r'filename="([^"]*)"', disposition)

        if filename_m:
            form[name] = {
                "filename": filename_m.group(1),
                "content": content,
                "content_type": part_headers.get("content-type", "application/octet-stream"),
            }
        else:
            form[name] = content.decode("utf-8", errors="ignore")

    return form


def parse_json_body(fp, headers):
    """Parse application/json request bodies."""
    content_length = int(headers.get("Content-Length", 0))
    if content_length == 0:
        return {}
    body = fp.read(content_length)
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


def build_match_result(provider, target_role, job_description, resume_text="", resume_file=None, jd_cache=None):
    parsed_resume_text = extract_resume_text(resume_file) if resume_file else ""
    combined_resume_text = "\n".join(
        value for value in (resume_text, parsed_resume_text) if value
    )
    if provider == "local" and resume_file and not combined_resume_text:
        raise ValueError(
            "This file type could not be parsed locally. Paste resume text, "
            "upload .txt/.rtf/.html/.docx, install optional PDF parsing, "
            "or use Affinda/RChilli."
        )

    result = match_with_provider(
        provider,
        resume_file,
        combined_resume_text,
        job_description,
        target_role=target_role,
        jd_cache=jd_cache,
    )
    result.setdefault("details", {})
    result["details"]["uploadedResume"] = resume_file["filename"] if resume_file else ""
    result["details"]["parsedResumeCharacters"] = len(parsed_resume_text)
    return result


def parse_skill_list(value):
    if not value:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    parts = re.split(r"[;,|]", str(value))
    return [part.strip() for part in parts if part.strip()]


def parse_batch_candidates_csv(batch_file):
    if not batch_file:
        return []
    text = decode_text(batch_file["content"])
    reader = csv.DictReader(text.splitlines())
    return normalize_batch_candidate_rows(reader)


def parse_batch_candidates_xlsx(batch_file):
    try:
        load_workbook = importlib.import_module("openpyxl").load_workbook
    except ImportError as exc:
        raise ValueError(
            "XLSX batch uploads require openpyxl. Install dependencies from requirements.txt."
        ) from exc

    workbook = load_workbook(filename=BytesIO(batch_file["content"]), read_only=True, data_only=True)
    sheet = workbook.active
    if sheet is None:
        return []
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(value or "").strip() for value in rows[0]]
    data_rows = []
    for row in rows[1:]:
        data_rows.append({headers[index]: value for index, value in enumerate(row) if index < len(headers)})
    return normalize_batch_candidate_rows(data_rows)


def normalize_batch_candidate_rows(rows):
    candidates = []
    for row in rows:
        normalized = {str(key or "").strip(): value for key, value in row.items()}
        candidates.append(
            {
                "candidate_id": str(normalized.get("candidate_id") or normalized.get("id") or "").strip(),
                "name": str(normalized.get("name") or normalized.get("candidate_name") or "").strip(),
                "email": str(normalized.get("email") or normalized.get("candidate_email") or "").strip(),
                "job_description": str(normalized.get("job_description") or normalized.get("jd") or "").strip(),
                "resume_text": str(normalized.get("resume_text") or normalized.get("summary") or "").strip(),
                "skills": parse_skill_list(normalized.get("skills") or ""),
                "experience": str(normalized.get("experience") or "").strip(),
                "location": str(normalized.get("location") or "").strip(),
                "shortlist_threshold": str(normalized.get("shortlist_threshold") or "").strip(),
            }
        )
    return candidates


def parse_batch_candidates_file(batch_file):
    if not batch_file:
        return []
    filename = batch_file["filename"].lower()
    if filename.endswith(".xlsx"):
        return parse_batch_candidates_xlsx(batch_file)
    return parse_batch_candidates_csv(batch_file)


def load_sample_batch_dataset(key):
    """Load a bundled sample batch (csv) and its default JD by key.

    Returns a tuple of (candidates_list, default_job_description) or (None, None)
    if the key is unknown.
    """
    config = SAMPLE_BATCH_DATASETS.get((key or "").strip().lower())
    if not config:
        return None, None
    csv_path = EXAMPLES / config["file"]
    if not csv_path.is_file():
        raise ValueError(f"Bundled sample dataset is missing: {config['file']}")
    batch_file = {
        "filename": config["file"],
        "content": csv_path.read_bytes(),
        "content_type": "text/csv",
    }
    candidates = parse_batch_candidates_file(batch_file)
    jd_path = EXAMPLES / config["jd_file"]
    job_description = jd_path.read_text(encoding="utf-8").strip() if jd_path.is_file() else ""
    return candidates, job_description


def batch_result_row(candidate, result, shortlist_threshold):
    return {
        "candidateId": candidate.get("candidate_id") or candidate.get("id") or "",
        "name": candidate.get("name") or "",
        "email": candidate.get("email") or "",
        "score": result.get("score", 0),
        "rating": result.get("rating", 0),
        "label": result.get("label", ""),
        "recommendation": result.get("recommendation", ""),
        "shortlisted": result.get("rating", 0) >= shortlist_threshold,
        "strengths": result.get("strengths", []),
        "gaps": result.get("gaps", []),
        "details": result.get("details", {}),
        "provider": result.get("provider", "local"),
    }


def batch_error_row(candidate, error_message):
    return {
        "candidateId": candidate.get("candidate_id") or candidate.get("id") or "",
        "name": candidate.get("name") or "",
        "email": candidate.get("email") or "",
        "error": error_message,
    }


class AppHandler(BaseHTTPRequestHandler):
    server_version = "CVMatchAI/1.0"

    def do_GET(self):
        if not self.authorized():
            return self.send_auth_required()
        if self.path == "/":
            return self.serve_file(STATIC / "index.html")
        if self.path == "/api/roles":
            return self.send_json({"roles": role_library()})
        if self.path == "/api/sample-batch-datasets":
            return self.send_json(
                {
                    "datasets": [
                        {"id": key, "label": meta["label"], "file": meta["file"]}
                        for key, meta in SAMPLE_BATCH_DATASETS.items()
                    ]
                }
            )
        if self.path.startswith("/static/"):
            file_path = STATIC / self.path.replace("/static/", "", 1)
            return self.serve_file(file_path)
        self.send_json({"error": "Not found"}, status=404)

    def do_POST(self):
        if not self.authorized():
            return self.send_auth_required()
        if self.path == "/api/match":
            return self.handle_match_request()
        if self.path == "/api/batch-match":
            return self.handle_batch_match_request()
        return self.send_json({"error": "Not found"}, status=404)

    def handle_match_request(self):
        try:
            form = parse_multipart_form(self.rfile, self.headers)
            provider = field_value(form, "provider") or "local"
            target_role = field_value(form, "target_role")
            job_description = field_value(form, "job_description")
            resume_text = field_value(form, "resume_text")
            resume_file = field_file(form, "resume")

            if not job_description:
                return self.send_json({"error": "Job description is required."}, status=400)
            if not resume_file and not resume_text:
                return self.send_json({"error": "Upload a resume or paste resume text."}, status=400)

            result = build_match_result(
                provider,
                target_role,
                job_description,
                resume_text=resume_text,
                resume_file=resume_file,
            )
            self.send_json(result)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, status=400)
        except ProviderError as exc:
            self.send_json({"error": str(exc)}, status=502)
        except Exception as exc:
            self.send_json({"error": f"Unexpected server error: {exc}"}, status=500)

    def handle_batch_match_request(self):
        try:
            content_type = self.headers.get("Content-Type", "")
            sample_dataset = ""
            if content_type.startswith("multipart/form-data"):
                form = parse_multipart_form(self.rfile, self.headers)
                provider = field_value(form, "provider") or "local"
                target_role = field_value(form, "target_role")
                job_description = field_value(form, "job_description")
                sample_dataset = field_value(form, "sample_dataset")
                uploaded_batch = field_file(form, "batch_file")
                if uploaded_batch:
                    candidates = parse_batch_candidates_file(uploaded_batch)
                elif sample_dataset:
                    sample_candidates, sample_jd = load_sample_batch_dataset(sample_dataset)
                    if sample_candidates is None:
                        return self.send_json(
                            {"error": f"Unknown sample dataset: {sample_dataset}"},
                            status=400,
                        )
                    candidates = sample_candidates
                    if not job_description and sample_jd:
                        job_description = sample_jd
                else:
                    candidates = []
                default_shortlist_threshold = int(field_value(form, "shortlist_threshold") or 4)
            else:
                payload = parse_json_body(self.rfile, self.headers)
                provider = str(payload.get("provider") or "local").strip().lower()
                target_role = str(payload.get("target_role") or "").strip()
                job_description = str(payload.get("job_description") or "").strip()
                sample_dataset = str(payload.get("sample_dataset") or "").strip()
                candidates = payload.get("candidates") or []
                if not candidates and sample_dataset:
                    sample_candidates, sample_jd = load_sample_batch_dataset(sample_dataset)
                    if sample_candidates is None:
                        return self.send_json(
                            {"error": f"Unknown sample dataset: {sample_dataset}"},
                            status=400,
                        )
                    candidates = sample_candidates
                    if not job_description and sample_jd:
                        job_description = sample_jd
                default_shortlist_threshold = int(payload.get("shortlist_threshold") or 4)

            if not job_description:
                return self.send_json({"error": "Job description is required."}, status=400)
            if not isinstance(candidates, list) or not candidates:
                return self.send_json(
                    {"error": "Candidates must be a non-empty array."},
                    status=400,
                )

            results = []
            matched_candidates = 0
            shortlisted_candidates = 0
            error_candidates = 0
            jd_cache = {}  # Share JD analysis across all candidates in a batch

            for index, candidate in enumerate(candidates, start=1):
                if not isinstance(candidate, dict):
                    error_candidates += 1
                    results.append(
                        batch_error_row(
                            {"candidate_id": f"candidate-{index}"},
                            "Candidate item must be an object.",
                        )
                    )
                    continue

                candidate_job_description = str(candidate.get("job_description") or job_description).strip()
                resume_text = str(candidate.get("resume_text") or "").strip()
                if not candidate_job_description:
                    error_candidates += 1
                    results.append(batch_error_row(candidate, "job_description is required either in the batch form or per candidate row."))
                    continue
                if not resume_text:
                    error_candidates += 1
                    results.append(batch_error_row(candidate, "resume_text is required for batch matching."))
                    continue

                shortlist_threshold = int(candidate.get("shortlist_threshold") or default_shortlist_threshold)
                try:
                    match_result = build_match_result(
                        provider,
                        target_role,
                        candidate_job_description,
                        resume_text=resume_text,
                        jd_cache=jd_cache,
                    )
                    row = batch_result_row(candidate, match_result, shortlist_threshold)
                    row["skills"] = candidate.get("skills") or []
                    row["experience"] = candidate.get("experience") or ""
                    row["location"] = candidate.get("location") or ""
                    row["jobDescription"] = candidate_job_description
                    matched_candidates += 1
                    shortlisted_candidates += 1 if row["shortlisted"] else 0
                    results.append(row)
                except ValueError as exc:
                    error_candidates += 1
                    results.append(batch_error_row(candidate, str(exc)))
                except ProviderError as exc:
                    error_candidates += 1
                    results.append(batch_error_row(candidate, str(exc)))

            self.send_json(
                {
                    "provider": provider,
                    "targetRole": target_role,
                    "processedCandidates": len(candidates),
                    "matchedCandidates": matched_candidates,
                    "shortlistedCandidates": shortlisted_candidates,
                    "errorCandidates": error_candidates,
                    "results": results,
                }
            )
        except json.JSONDecodeError:
            self.send_json({"error": "Request body must be valid JSON."}, status=400)
        except Exception as exc:
            self.send_json({"error": f"Unexpected server error: {exc}"}, status=500)

    def serve_file(self, file_path):
        try:
            resolved = file_path.resolve()
            if not str(resolved).startswith(str(STATIC.resolve())):
                raise FileNotFoundError
            content = resolved.read_bytes()
        except FileNotFoundError:
            return self.send_json({"error": "Not found"}, status=404)

        content_type = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        if os.getenv("BASIC_AUTH_ENABLED", "true").strip().lower() in {"0", "false", "no", "off"}:
            return True
        expected_user = os.getenv("RECRUITER_USERNAME", "recruiter")
        expected_password = os.getenv("RECRUITER_PASSWORD", "change-me")
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        except Exception:
            return False
        username, _, password = decoded.partition(":")
        return hmac.compare_digest(username, expected_user) and hmac.compare_digest(
            password, expected_password
        )

    def send_auth_required(self):
        body = json.dumps({"error": "Authentication required."}).encode("utf-8")
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="CV Match Recruiter"')
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def field_value(form, name):
    if name not in form:
        return ""
    value = form[name]
    if isinstance(value, dict):  # It's a file, not a text field
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return str(value).strip()


def field_file(form, name):
    if name not in form:
        return None
    item = form[name]
    if not isinstance(item, dict):
        return None
    if not item.get("filename"):
        return None
    if not item.get("content"):
        return None
    return {
        "filename": Path(item["filename"]).name,
        "content": item["content"],
        "content_type": item.get("content_type", "application/octet-stream"),
    }


def decode_text(content):
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def strip_html(text):
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


def strip_rtf(text):
    text = re.sub(r"\\'[0-9a-fA-F]{2}", " ", text)
    text = re.sub(r"\\[a-zA-Z]+-?\d* ?", " ", text)
    text = text.replace("{", " ").replace("}", " ")
    return re.sub(r"\s+", " ", text).strip()


def extract_docx_text(content):
    parts = []
    with zipfile.ZipFile(BytesIO(content)) as archive:
        with archive.open("word/document.xml") as document:
            root = ElementTree.fromstring(document.read())
    for node in root.iter():
        if node.tag.endswith("}t") and node.text:
            parts.append(node.text)
    return " ".join(parts).strip()


def extract_pdf_text(content):
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    reader = PdfReader(BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def extract_resume_text(resume_file):
    if not resume_file:
        return ""
    filename = resume_file["filename"].lower()
    content = resume_file["content"]
    content_type = resume_file.get("content_type", "")
    try:
        if filename.endswith(".docx"):
            return extract_docx_text(content)
        if filename.endswith(".pdf") or content_type == "application/pdf":
            return extract_pdf_text(content)
        text = decode_text(content)
        if filename.endswith((".html", ".htm")) or "html" in content_type:
            return strip_html(text)
        if filename.endswith(".rtf") or "rtf" in content_type:
            return strip_rtf(text)
        if filename.endswith(".txt") or content_type.startswith("text/"):
            return text.strip()
    except Exception:
        return ""
    return ""


def main():
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    httpd = ThreadingHTTPServer((host, port), AppHandler)
    print(f"CV Match AI Agent running at http://{host}:{port}")
    print(f"HTTPS certificates: {ssl_status()}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
