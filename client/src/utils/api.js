import axios from 'axios';

// Note: do NOT set a default Content-Type at the instance level.
// Axios sets `application/json` automatically for object bodies and lets
// FormData / Blob requests use their own auto-generated multipart boundary.
// A static default here BREAKS multipart uploads (multer sees zero files).
const api = axios.create({
  baseURL: '/api'
});

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('tl_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tl_token');
      localStorage.removeItem('tl_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
