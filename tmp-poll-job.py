import requests
import json
import time

job_id = 'job_cc0fc1d0-8861-478f-b436-fced1d43f23b'
pid = 'proj_282a0d57-2039-4995-b0f7-c24df951fd55'

token = requests.post('https://lumen-ink.vercel.app/api/auth', json={'password':'bw6OgcpEfkeVFCKM'}).json()['token']
headers = {'Authorization': f'Bearer {token}'}

for i in range(40):
    r = requests.get(f'https://lumen-ink.vercel.app/api/projects/{pid}/jobs/{job_id}', headers=headers)
    job = r.json()
    status = job.get('status')
    print(f'{i*5}s status={status}')
    if status in ('completed', 'failed', 'error'):
        print(json.dumps(job, indent=2, ensure_ascii=False))
        break
    time.sleep(5)
else:
    print('timeout')
