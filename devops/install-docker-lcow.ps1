Stop-Service *docker*

Invoke-WebRequest -UseBasicParsing -OutFile dockerd.exe https://master.dockerproject.org/windows/x86_64/dockerd.exe
Invoke-WebRequest -UseBasicParsing -OutFile docker.exe https://master.dockerproject.org/windows/x86_64/docker.exe
Invoke-WebRequest -UseBasicParsing -OutFile release.zip https://github.com/linuxkit/lcow/releases/download/v4.14.35-v0.3.9/release.zip

Remove-Item "$env:ProgramFiles\Linux Containers" -Force -Recurse
Expand-Archive release.zip -DestinationPath "$Env:ProgramFiles\Linux Containers\."
Remove-Item release.zip

.\dockerd.exe -D --experimental