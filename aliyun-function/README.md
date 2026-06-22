# Aliyun shared-state function

Runtime settings:

- Custom runtime, Python 3 available
- Start command: `python3 app.py`
- Port: `9000`
- Minimum instances: `0`
- OSS mount path: `/mnt/dashboard`
- Environment variable `STATE_FILE=/mnt/dashboard/dashboard-state.json`
- Environment variable `ALLOWED_ORIGIN=https://galenwu962-hub.github.io`

The function exposes `GET /state` and `PUT /state`.
