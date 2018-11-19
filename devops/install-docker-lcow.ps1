Stop-Service *docker*

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Invoke-WebRequest -UseBasicParsing -OutFile dockerd.exe https://master.dockerproject.org/windows/x86_64/dockerd.exe
Invoke-WebRequest -UseBasicParsing -OutFile docker.exe https://master.dockerproject.org/windows/x86_64/docker.exe
Invoke-WebRequest -UseBasicParsing -OutFile release.zip https://github.com/linuxkit/lcow/releases/download/v4.14.35-v0.3.9/release.zip

Expand-Archive release.zip -DestinationPath "$Env:ProgramFiles\Linux Containers\." -Force

.\dockerd.exe -D --experimental