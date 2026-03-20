# Cognito Authorizer Client - Download and Run Script
# Run this script from any folder to download and run the project

param(
    [switch]$SkipRun
)

$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/iamatjlovelock/cognito-authorizer-client/archive/refs/heads/main.zip"
$zipFile = "cognito-authorizer-client.zip"
$extractedFolder = "cognito-authorizer-client-main"

Write-Host "Downloading cognito-authorizer-client..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $repoUrl -OutFile $zipFile

Write-Host "Extracting..." -ForegroundColor Cyan
Expand-Archive -Path $zipFile -DestinationPath . -Force

# Move contents from extracted folder to current directory
Get-ChildItem -Path $extractedFolder | Move-Item -Destination . -Force
Remove-Item -Path $extractedFolder -Force
Remove-Item -Path $zipFile -Force

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "Building project..." -ForegroundColor Cyan
npm run build

if (-not $SkipRun) {
    Write-Host "Starting cognito-authz..." -ForegroundColor Green
    npm start
} else {
    Write-Host "Done! Run 'npm start' to start the CLI." -ForegroundColor Green
}
