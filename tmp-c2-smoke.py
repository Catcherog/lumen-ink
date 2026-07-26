import requests
import json
import base64
import uuid
import time

# Disable env proxy for this test; direct connection to Vercel works.
session = requests.Session()
session.trust_env = False
TOKEN = session.post('https://lumen-ink.vercel.app/api/auth', json={'password':'bw6OgcpEfkeVFCKM'}).json()['token']
HEADERS = {'Authorization': f'Bearer {TOKEN}'}

# Create project
with open(r'C:\Users\Catcher\Desktop\协作文件夹\5afe8c5d80a702a71918f43894b9ea88.jpg', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('ascii')

body = {'name':'Lane-C-Smoke-4','imageBase64':b64,'mimeType':'image/jpeg'}
r = session.post('https://lumen-ink.vercel.app/api/projects', json=body, headers=HEADERS)
print('create project', r.status_code)
proj = r.json()
pid = proj['project']['id']
vid = proj['project']['activeVersionId']
print('project', pid, 'version', vid)

# Create job
idemp = str(uuid.uuid4())
job_body = {'prompt':'自然美白，轻微磨皮，保留面部特征','inputVersionId':vid}
r = session.post(f'https://lumen-ink.vercel.app/api/projects/{pid}/jobs', json=job_body, headers={**HEADERS, 'Idempotency-Key':idemp})
print('create job', r.status_code)
job = r.json()
print(json.dumps(job, indent=2, ensure_ascii=False))
job_id = job['id']

# Poll
for i in range(40):
    time.sleep(5)
    r = session.get(f'https://lumen-ink.vercel.app/api/jobs/{job_id}', headers=HEADERS)
    job = r.json()
    status = job.get('status')
    print(f'{i*5+5}s status={status}')
    if status in ('completed', 'failed', 'error'):
        print(json.dumps(job, indent=2, ensure_ascii=False))
        break
else:
    print('timeout')
