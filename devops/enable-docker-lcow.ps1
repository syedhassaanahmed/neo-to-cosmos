$DOCKER_SERVICES="*docker*"
Stop-Service $DOCKER_SERVICES

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -OutFile dockerd.exe https://master.dockerproject.org/windows/x86_64/dockerd.exe
Invoke-WebRequest -OutFile docker.exe https://master.dockerproject.org/windows/x86_64/docker.exe
Invoke-WebRequest -OutFile release.zip https://github.com/linuxkit/lcow/releases/download/v4.14.35-v0.3.9/release.zip

Move-Item -Path .\docke*.exe -Destination "$env:ProgramFiles\Docker" -Force
Expand-Archive release.zip -DestinationPath "$Env:ProgramFiles\Linux Containers\." -Force

$DOCKER_DAEMON_CONFIG="$env:programdata\docker\config\daemon.json"
if (!(Test-Path $DOCKER_DAEMON_CONFIG)) {
    New-Item -ItemType "file" -Path $DOCKER_DAEMON_CONFIG -Value "{}" -Force
}
$DOCKER_DAEMON_JSON = Get-Content $DOCKER_DAEMON_CONFIG | Out-String | ConvertFrom-Json
$DOCKER_DAEMON_JSON | Add-Member -Type NoteProperty -Name 'experimental' -Value $True -Force
$DOCKER_DAEMON_JSON | ConvertTo-Json | Set-Content $DOCKER_DAEMON_CONFIG

Start-Service $DOCKER_SERVICES

do
{
    Write-Host "waiting for Docker to start..."
    Start-Sleep 1
} until ((Get-Service $DOCKER_SERVICES | Where-Object {$_.status -eq "Running"}).count -eq 1)

docker info