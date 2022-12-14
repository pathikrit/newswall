1. Install Docker:
```
brew install colima docker-compose
```

2. Start and verify that Docker daemon is running:
```
colima start
docker ps -a
```

3. Setup directory
```
cd ~/Downloads/
mkdir -p visionect
cd visionect
```

4. Use `uuidgen` to set a valid uuid key to ensure web interface cookie validity and previous user sessions
```
set VISIONECT_SERVER_DEPLOYMENT_KEY 28531EA8-8187-4F24-B1F4-95531FC45B2D
```

5. Download and run the docker file:
```
curl https://docs.visionect.com/_downloads/cda94dc639573626dadb9a3c907a429f/docker-compose.yml --output docker-compose.yml
```