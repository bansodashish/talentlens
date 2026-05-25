import base64
import json
import os
import ssl
import urllib.parse
import urllib.request
import uuid

from scoring import local_match, rating_from_score, recommendation_from_rating


class ProviderError(RuntimeError):
    pass


def require_env(name):
    value = os.getenv(name)
    if not value:
        raise ProviderError(f"Missing environment variable: {name}")
    return value


def env_is_false(name):
    return os.getenv(name, "").strip().lower() in {"0", "false", "no", "off"}


def env_is_true(name):
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def ca_bundle_path():
    explicit = os.getenv("SSL_CERT_FILE") or os.getenv("REQUESTS_CA_BUNDLE")
    if explicit:
        return explicit
    try:
        import certifi

        return certifi.where()
    except ImportError:
        return ""


def ssl_status():
    if env_is_true("DISABLE_SSL_VERIFY") or env_is_false("AFFINDA_SSL_VERIFY"):
        return "verification disabled by environment flag"
    path = ca_bundle_path()
    return f"using CA bundle {path}" if path else "using Python default CA bundle"


def ssl_context():
    if env_is_true("DISABLE_SSL_VERIFY") or env_is_false("AFFINDA_SSL_VERIFY"):
        return ssl._create_unverified_context()
    path = ca_bundle_path()
    if path:
        return ssl.create_default_context(cafile=path)
    return ssl.create_default_context()


def provider_connection_error(provider_name, reason):
    if isinstance(reason, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in str(reason):
        raise ProviderError(
            f"{provider_name} request failed: SSL certificate verification failed. "
            f"{ssl_status()}. If this still fails, run "
            "`python3 -m pip install --upgrade certifi`, set SSL_CERT_FILE to your "
            "company/root CA bundle, or temporarily set AFFINDA_SSL_VERIFY=false "
            "for local testing only."
        )
    raise ProviderError(f"{provider_name} request failed: {reason}")


def http_json(url, method="POST", headers=None, body=None):
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=90, context=ssl_context()) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise ProviderError(f"Provider request failed ({exc.code}): {message}") from exc
    except urllib.error.URLError as exc:
        provider_connection_error("Provider", exc.reason)
    except ssl.SSLError as exc:
        provider_connection_error("Provider", exc)


def multipart_body(fields, files):
    boundary = "----cv-match-" + uuid.uuid4().hex
    chunks = []
    for name, value in fields.items():
        if value is None:
            continue
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(str(value).encode())
        chunks.append(b"\r\n")
    for name, file_info in files.items():
        filename, content, content_type = file_info
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        chunks.append(f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n".encode())
        chunks.append(content)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return boundary, b"".join(chunks)


def http_multipart(url, token, fields, files):
    boundary, body = multipart_body(fields, files)
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120, context=ssl_context()) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise ProviderError(f"Affinda request failed ({exc.code}): {message}") from exc
    except urllib.error.URLError as exc:
        provider_connection_error("Affinda", exc.reason)
    except ssl.SSLError as exc:
        provider_connection_error("Affinda", exc)


def nested_get(data, *paths):
    for path in paths:
        current = data
        for key in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(key)
        if current:
            return current
    return None


def find_score(data):
    if not isinstance(data, dict):
        return None
    score_keys = {
        "score", "matchScore", "match_score", "overallScore", "overall_score",
        "fitScore", "fit_score", "similarity", "confidence"
    }
    stack = [data]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            for key, value in current.items():
                normalized_key = key[0].lower() + key[1:] if key else key
                if (key in score_keys or normalized_key in score_keys) and isinstance(value, (int, float, str)):
                    try:
                        score = float(value)
                    except ValueError:
                        continue
                    return score / 100 if score > 1 else score
                if isinstance(value, (dict, list)):
                    stack.append(value)
        elif isinstance(current, list):
            stack.extend(current)
    return None


def affinda_base_url():
    region = os.getenv("AFFINDA_REGION", "api").strip()
    if region.startswith("http"):
        return region.rstrip("/")
    if region == "api":
        return "https://api.affinda.com"
    return f"https://{region}.affinda.com"


def affinda_upload_jd(job_description, token=None, base_url=None):
    token = token or require_env("AFFINDA_API_KEY")
    base_url = base_url or affinda_base_url()
    jd_path = os.getenv("AFFINDA_JD_UPLOAD_PATH", "/v2/job_descriptions")
    jd_response = http_multipart(
        base_url + jd_path,
        token,
        {"wait": "true"},
        {"file": ("job-description.txt", job_description.encode("utf-8"), "text/plain")},
    )
    jd_id = nested_get(
        jd_response,
        ("meta", "identifier"),
        ("meta", "id"),
        ("identifier",),
        ("id",),
    )
    if not jd_id:
        raise ProviderError("Affinda did not return a job description identifier.")
    return jd_id


def affinda_match(resume_file, resume_text, job_description, target_role="", jd_cache=None):
    token = require_env("AFFINDA_API_KEY")
    base_url = affinda_base_url()
    resume_path = os.getenv("AFFINDA_RESUME_UPLOAD_PATH", "/v2/resumes")
    match_path = os.getenv("AFFINDA_MATCH_PATH", "/v3/resume_search/match")

    resume_bytes = resume_file["content"] if resume_file else (resume_text or "").encode("utf-8")
    resume_name = resume_file["filename"] if resume_file else "resume.txt"
    resume_type = resume_file["content_type"] if resume_file else "text/plain"

    resume_response = http_multipart(
        base_url + resume_path,
        token,
        {"wait": "true"},
        {"file": (resume_name, resume_bytes, resume_type)},
    )

    # Reuse a previously uploaded JD identifier if a cache is provided.
    jd_id = None
    if isinstance(jd_cache, dict):
        jd_id = jd_cache.get(job_description)
    if not jd_id:
        jd_id = affinda_upload_jd(job_description, token=token, base_url=base_url)
        if isinstance(jd_cache, dict):
            jd_cache[job_description] = jd_id

    resume_id = nested_get(
        resume_response,
        ("meta", "identifier"),
        ("meta", "id"),
        ("identifier",),
        ("id",),
    )
    if not resume_id:
        raise ProviderError("Affinda did not return a resume identifier.")

    query = urllib.parse.urlencode({"resume": resume_id, "job_description": jd_id})
    match_response = None
    match_error = None
    try:
        match_response = http_json(
            f"{base_url}{match_path}?{query}",
            method="GET",
            headers={"Authorization": f"Bearer {token}"},
        )
    except ProviderError as exc:
        err_str = str(exc)
        if "404" in err_str or "not found" in err_str.lower() or "not_found" in err_str:
            match_error = (
                "Affinda Search & Match is not available for this account "
                "(resume not in a search index). Falling back to local skill scorer "
                "using Affinda-parsed resume text."
            )
        else:
            raise

    if match_error:
        parsed_text = resume_text or extract_rchilli_text(resume_response)
        fallback = local_match(
            parsed_text,
            job_description,
            provider="affinda-local-fallback",
            target_role=target_role,
            raw={
                "warning": match_error,
                "resumeIdentifier": resume_id,
                "jobDescriptionIdentifier": jd_id,
            },
        )
        fallback["gaps"].insert(0, match_error)
        return fallback

    score = find_score(match_response)
    if score is None:
        fallback = local_match(
            resume_text or extract_rchilli_text(resume_response),
            job_description,
            provider="affinda-local-fallback",
            target_role=target_role,
            raw={
                "warning": "Affinda did not return a recognizable score field.",
                "resumeIdentifier": resume_id,
                "jobDescriptionIdentifier": jd_id,
                "match": match_response,
            },
        )
        fallback["gaps"].insert(0, "Affinda score field was not found; local weighted scorer was used.")
        return fallback

    rating, label = rating_from_score(score)
    details = match_response.get("details", {})

    strengths = []
    gaps = []
    for key, value in details.items():
        if not isinstance(value, dict):
            continue
        item_score = float(value.get("score") or 0)
        label_text = value.get("label") or key
        if item_score >= 0.65:
            strengths.append(f"{label_text} is a strong match")
        elif item_score <= 0.4:
            gaps.append(f"{label_text} needs review")

    return {
        "provider": "affinda",
        "score": round(score, 2),
        "rating": rating,
        "label": label,
        "recommendation": recommendation_from_rating(rating),
        "strengths": strengths or ["Affinda returned a positive overall match signal"],
        "gaps": gaps or ["No major provider-level gaps returned"],
        "details": details,
        "raw": {
            "resumeIdentifier": resume_id,
            "jobDescriptionIdentifier": jd_id,
            "match": match_response,
        },
    }


def extract_rchilli_text(parsed):
    if not isinstance(parsed, dict):
        return ""
    data = parsed.get("ResumeParserData") or parsed.get("JDParserData") or parsed
    parts = []

    def walk(value):
        if isinstance(value, dict):
            for nested in value.values():
                walk(nested)
        elif isinstance(value, list):
            for nested in value:
                walk(nested)
        elif isinstance(value, str):
            parts.append(value)

    walk(data)
    return " ".join(parts)


def rchilli_match(resume_file, resume_text, job_description, target_role=""):
    user_key = require_env("RCHILLI_USER_KEY")
    sub_user_id = require_env("RCHILLI_SUB_USER_ID")
    version = os.getenv("RCHILLI_VERSION", "8.0.0")
    resume_url = os.getenv(
        "RCHILLI_RESUME_PARSE_URL",
        "https://rest.rchilli.com/RChilliParser/Rchilli/parseResumeBinary",
    )
    jd_url = os.getenv(
        "RCHILLI_JD_PARSE_URL",
        "https://jdrest.rchilli.com/JDParser/RChilli/ParseJDText",
    )

    resume_bytes = resume_file["content"] if resume_file else (resume_text or "").encode("utf-8")
    resume_name = resume_file["filename"] if resume_file else "resume.txt"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    resume_payload = {
        "filedata": base64.b64encode(resume_bytes).decode("utf-8"),
        "filename": resume_name,
        "userkey": user_key,
        "version": version,
        "subuserid": sub_user_id,
    }
    jd_payload = {
        "filedata": base64.b64encode(job_description.encode("utf-8")).decode("utf-8"),
        "filename": "job-description.txt",
        "userkey": user_key,
        "version": version,
        "subuserid": sub_user_id,
    }

    resume_response = http_json(resume_url, headers=headers, body=resume_payload)
    jd_response = http_json(jd_url, headers=headers, body=jd_payload)

    if os.getenv("RCHILLI_USE_ONEMATCH", "false").lower() == "true":
        one_match_url = os.getenv(
            "RCHILLI_ONEMATCH_URL",
            "https://searchengine.rchilli.com/RChilliSearchEngineAPI/RChilli/v4/oneMatch",
        )
        one_match_payload = {
            "userkey": user_key,
            "version": version,
            "subuserid": sub_user_id,
            "resume": resume_response.get("ResumeParserData", resume_response),
            "job": jd_response.get("JDParserData", jd_response),
        }
        match_response = http_json(one_match_url, headers=headers, body=one_match_payload)
        provider_score = (
            match_response.get("score")
            or match_response.get("Score")
            or match_response.get("matchScore")
            or match_response.get("MatchScore")
        )
        if provider_score is not None:
            score = float(provider_score)
            if score > 1:
                score = score / 100
            rating, label = rating_from_score(score)
            return {
                "provider": "rchilli",
                "score": round(score, 2),
                "rating": rating,
                "label": label,
                "recommendation": recommendation_from_rating(rating),
                "strengths": ["RChilli one-to-one match completed"],
                "gaps": ["Review provider details for field-level gaps"],
                "details": match_response,
                "raw": {
                    "resume": resume_response,
                    "jobDescription": jd_response,
                    "match": match_response,
                },
            }

    result = local_match(
        extract_rchilli_text(resume_response),
        extract_rchilli_text(jd_response) or job_description,
        provider="rchilli",
        target_role=target_role,
        raw={"resume": resume_response, "jobDescription": jd_response},
    )
    result["details"]["providerMode"] = "RChilli parsing + local weighted scorer"
    return result


def openai_match(resume_text, job_description, target_role=""):
    """Score CV match using OpenAI GPT"""
    try:
        from openai import OpenAI
    except ImportError:
        raise ProviderError("OpenAI library not installed. Run: pip install openai")

    api_key = require_env("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4-turbo")

    client = OpenAI(api_key=api_key)

    # Truncate to keep token count reasonable
    resume_excerpt = resume_text[:4000] if resume_text else ""
    jd_excerpt = job_description[:4000] if job_description else ""

    prompt = f"""You are an expert recruiter. Analyze the match between this resume and job description and  skills

Resume:
{resume_excerpt}

Job Description:
{jd_excerpt}

Target Role: {target_role or 'Infer from the job description'}

Instructions:
1. Extract the explicit required skills, tools, and technologies from the JOB DESCRIPTION (e.g. Python, AWS, Kubernetes, SQL, React, Spring Boot).
2. Check the RESUME for each required skill. Treat closely related items (e.g. "Postgres" matches "PostgreSQL") as matched.
3. Compare overall years of experience, seniority, and domain alignment.
4. Return ONLY a JSON object - no commentary, no markdown fences.

JSON schema:
{{
    "rating": <integer 1-5>,
    "score": <float 0.0-1.0>,
    "label": "<strong match|good match|fair match|poor match>",
    "recommendation": "<shortlist for interview|schedule interview|consider for future|reject>",
    "strengths": [<short bullet strings>],
    "gaps": [<short bullet strings>],
    "matchedSkills": [<skills present in BOTH resume and JD>],
    "missingSkills": [<skills required by JD but NOT found in resume>],
    "experienceAssessment": "<one-sentence summary of experience fit>"
}}"""

    request_kwargs = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 800,
    }
    # response_format=json_object is only supported on newer models
    # (gpt-4-turbo, gpt-4o, gpt-3.5-turbo-1106+). Skip it for legacy gpt-4.
    if any(tag in model.lower() for tag in ("turbo", "gpt-4o", "gpt-4.1", "gpt-5", "o1", "o3", "o4")):
        request_kwargs["response_format"] = {"type": "json_object"}

    try:
        try:
            response = client.chat.completions.create(**request_kwargs)
        except Exception as first_err:
            # Retry without response_format if the model rejects it
            if "response_format" in str(first_err) and "response_format" in request_kwargs:
                request_kwargs.pop("response_format", None)
                response = client.chat.completions.create(**request_kwargs)
            else:
                raise

        result_text = response.choices[0].message.content.strip()
        # Clean up markdown code blocks if present
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.startswith("```"):
            result_text = result_text[3:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
        result_text = result_text.strip()

        parsed = json.loads(result_text)

        matched_skills = parsed.get("matchedSkills") or []
        missing_skills = parsed.get("missingSkills") or []
        experience_summary = parsed.get("experienceAssessment", "")

        return {
            "provider": "openai",
            "rating": parsed.get("rating", 3),
            "score": float(parsed.get("score", 0.5)),
            "label": parsed.get("label", "fair match"),
            "recommendation": parsed.get("recommendation", "consider for future"),
            "strengths": parsed.get("strengths", []),
            "gaps": parsed.get("gaps", []),
            "details": {
                "targetRole": target_role,
                "providerMode": "OpenAI GPT analysis",
                "matchedSkills": matched_skills,
                "missingSkills": missing_skills,
                "experienceAssessment": experience_summary,
                "explanations": [
                    f"Analyzed by OpenAI ({model})",
                    f"Matched skills: {len(matched_skills)}",
                    f"Missing skills: {len(missing_skills)}",
                ],
            },
        }

    except json.JSONDecodeError as e:
        raise ProviderError(f"OpenAI returned invalid JSON: {e}")
    except Exception as e:
        raise ProviderError(f"OpenAI API error: {str(e)}")


def match_with_provider(provider, resume_file, resume_text, job_description, target_role="", jd_cache=None):
    provider = (provider or "local").lower()
    if provider == "affinda":
        return affinda_match(
            resume_file, resume_text, job_description, target_role=target_role, jd_cache=jd_cache
        )
    if provider == "rchilli":
        return rchilli_match(resume_file, resume_text, job_description, target_role=target_role)
    if provider == "openai":
        try:
            return openai_match(resume_text or "", job_description, target_role=target_role)
        except ProviderError as exc:
            result = local_match(
                resume_text or "",
                job_description,
                provider="openai-local-fallback",
                target_role=target_role,
            )
            result["gaps"].insert(0, f"OpenAI unavailable ({exc}); local skill scorer was used.")
            return result
    return local_match(resume_text or "", job_description, provider="local", target_role=target_role, jd_cache=jd_cache)
