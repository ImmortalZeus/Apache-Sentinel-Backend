# Khai bao bien o pham vi script
$script:targetUrl = "http://127.0.0.1"
$script:requestCount = 200
$script:delayMs = 0

function Show-Intro {
    Clear-Host
    Write-Host ""
    Write-Host "    ___                    __          ____           __  _            __" -ForegroundColor DarkOrange
    Write-Host "   /   |  ____  ____ _____/ /_  ___   / ___|  ___  ____/ /_(_)___  ___  / /" -ForegroundColor DarkOrange
    Write-Host "  / /| | / __ \/ __ `/ ___/ __ \/ _ \ \__ \ / _ \/ __ \/ __/ / __ \/ _ \/ /" -ForegroundColor DarkOrange
    Write-Host " / ___ |/ /_/ / /_/ / /__/ / / /  __/ ___/ /  __/ / / / /_/ / / / /  __/ / " -ForegroundColor DarkOrange
    Write-Host "/_/  |_/ .___/\__,_/\___/_/ /_/\___/ /____/ \___/_/ /_/\__/_/_/ /_/\___/_/ " -ForegroundColor DarkOrange
    Write-Host "      /_/                                                                  " -ForegroundColor DarkOrange
    Write-Host ""
    Write-Host "                  COMPREHENSIVE ATTACK SIMULATOR TOOL" -ForegroundColor Cyan
    Write-Host "===============================================================================" -ForegroundColor DarkGray
    Write-Host " This tool simulates various DoS and DDoS attack vectors against the Apache " -ForegroundColor White
    Write-Host " Sentinel backend to validate its rate-limiting, botnet detection, and " -ForegroundColor White
    Write-Host " automated firewall-blocking capabilities." -ForegroundColor White
    Write-Host "===============================================================================" -ForegroundColor DarkGray
    Write-Host "`n SCENARIOS:" -ForegroundColor Cyan
    Write-Host " [1] Normal Traffic:       Simulates a slow, legitimate user browsing." -ForegroundColor Green
    Write-Host " [2] Flash Crowd (Normal): Hundreds of unique IPs hitting a single page (e.g. Course Reg)." -ForegroundColor Yellow
    Write-Host " [3] HTTP Flood (DoS):     Simulates cache-busting by adding random queries." -ForegroundColor Yellow
    Write-Host " [4] Global Flood (DDoS):  Massive traffic from completely random global IPs." -ForegroundColor Red
    Write-Host " [5] Coordinated (DDoS):   Botnet hitting a 404 URL to trigger Swarm Block." -ForegroundColor Red
    Write-Host " [6] Subnet Attack (DDoS): Attack originating from a single /24 Subnet." -ForegroundColor Red
    Write-Host ""
}

function Set-Params {
    Write-Host "`n--- CAU HINH THONG SO ---" -ForegroundColor Cyan
    $newUrl = Read-Host "Nhap Target URL hien tai ($script:targetUrl) [Enter de giu nguyen]"
    if (-not [string]::IsNullOrWhiteSpace($newUrl)) { $script:targetUrl = $newUrl }

    $newCount = Read-Host "Nhap so luong Requests hien tai ($script:requestCount) [Enter de giu nguyen]"
    if (-not [string]::IsNullOrWhiteSpace($newCount)) { $script:requestCount = [int]$newCount }

    $newDelay = Read-Host "Nhap thoi gian delay (ms) hien tai ($script:delayMs) [Enter de giu nguyen]"
    if (-not [string]::IsNullOrWhiteSpace($newDelay)) { $script:delayMs = [int]$newDelay }

    Write-Host "[v] Da cap nhat thong so!" -ForegroundColor Green
}

# ==========================================
# 1. DOS SCENARIOS (Single IP Attack)
# ==========================================

function Send-Normal {
    Write-Host "`n[*] Gia lap Normal Traffic ($script:requestCount requests, delay 500ms)..." -ForegroundColor Green
    for ($i=1; $i -le $script:requestCount; $i++) {
        $url = "$($script:targetUrl)/"
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
            Write-Host -NoNewline "."
        } catch {
            Write-Host -NoNewline "!"
        }
        Start-Sleep -Milliseconds 500
    }
    Write-Host "`n[*] Hoan thanh."
}

function Send-FlashCrowd {
    Write-Host "`n[*] [Flash Crowd] Gia lap Flash Crowd ($script:requestCount reqs lien tuc - Hang tram IP cung truy cap 1 URL)..." -ForegroundColor Yellow
    for ($i=1; $i -le $script:requestCount; $i++) {
        # Generate random unique IPs for each request
        $fakeIp = "$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254))"
        $url = "$($script:targetUrl)/course-registration-login"
        try {
            Invoke-WebRequest -Uri $url -Headers @{"X-Forwarded-For"=$fakeIp} -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
            Write-Host -NoNewline "."
        } catch {
            Write-Host -NoNewline "!"
        }
        if ($script:delayMs -gt 0) { Start-Sleep -Milliseconds $script:delayMs }
    }
    Write-Host "`n[*] Hoan thanh."
}

function Send-HTTPFlood {
    Write-Host "`n[*] [DoS] Gia lap HTTP Flood ($script:requestCount reqs - Cache-Busting random param)..." -ForegroundColor Red
    for ($i=1; $i -le $script:requestCount; $i++) {
        $randStr = -join ((65..90) + (97..122) | Get-Random -Count 8 | % {[char]$_})
        $url = "$($script:targetUrl)/?q=$randStr"
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
            Write-Host -NoNewline "!"
        } catch {
            Write-Host -NoNewline "?"
        }
        if ($script:delayMs -gt 0) { Start-Sleep -Milliseconds $script:delayMs }
    }
    Write-Host "`n[*] Hoan thanh."
}

# ==========================================
# 2. DDOS SCENARIOS (Multi IP Attack)
# ==========================================

function Send-GlobalVolumetricDDoS {
    Write-Host "`n[*] [DDoS - Stage 1] Global Volumetric Flood ($script:requestCount reqs - Random IPs toan cau)..." -ForegroundColor Magenta
    for ($i=1; $i -le $script:requestCount; $i++) {
        $fakeIp = "$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254))"
        $url = "$($script:targetUrl)/"
        try {
            Invoke-WebRequest -Uri $url -Headers @{"X-Forwarded-For"=$fakeIp} -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
            Write-Host -NoNewline "G"
        } catch {
            Write-Host -NoNewline "x"
        }
        if ($script:delayMs -gt 0) { Start-Sleep -Milliseconds $script:delayMs }
    }
    Write-Host "`n[*] Hoan thanh."
}

function Send-CoordinatedBotnet {
    Write-Host "`n[*] [DDoS - Stage 2] Coordinated Botnet ($script:requestCount reqs - Nhieu IP tan cong 1 URL bi loi)..." -ForegroundColor Magenta
    # Cố tình truy cập 1 URL không tồn tại để Apache trả về lỗi 404
    # Mục đích kích hoạt ngưỡng Error Ratio (80%)
    for ($i=1; $i -le $script:requestCount; $i++) {
        $fakeIp = "$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254)).$((Get-Random -Minimum 1 -Maximum 254))"
        $url = "$($script:targetUrl)/non-existent-login-path"
        try {
            Invoke-WebRequest -Uri $url -Headers @{"X-Forwarded-For"=$fakeIp} -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
            Write-Host -NoNewline "B"
        } catch {
            # Catch block sẽ chạy vì nhận error 404 -> Tạo Error Rate cho Detector
            Write-Host -NoNewline "E"
        }
        if ($script:delayMs -gt 0) { Start-Sleep -Milliseconds $script:delayMs }
    }
    Write-Host "`n[*] Hoan thanh."
}

function Send-SubnetAttack {
    Write-Host "`n[*] [DDoS - Stage 3] Subnet Volumetric Attack ($script:requestCount reqs - Tu cung 1 Subnet /24)..." -ForegroundColor Magenta
    $subnetBase = "10.0.50"
    Write-Host "    Target Subnet: $subnetBase.0/24"
    for ($i=1; $i -le $script:requestCount; $i++) {
        $fakeIp = "$subnetBase.$((Get-Random -Minimum 1 -Maximum 254))"
        $randStr = -join ((65..90) + (97..122) | Get-Random -Count 8 | % {[char]$_})
        $url = "$($script:targetUrl)/?q=$randStr"
        try {
            Invoke-WebRequest -Uri $url -Headers @{"X-Forwarded-For"=$fakeIp} -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
            Write-Host -NoNewline "S"
        } catch {
            Write-Host -NoNewline "x"
        }
        if ($script:delayMs -gt 0) { Start-Sleep -Milliseconds $script:delayMs }
    }
    Write-Host "`n[*] Hoan thanh."
}


# --- START SCRIPT ---
Show-Intro

# --- MENU CHINH ---
do {
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host " [0] Cau hinh thong so (URL: $script:targetUrl | Reqs: $script:requestCount | Delay: $script:delayMs ms)" -ForegroundColor DarkGray
    Write-Host " --- DoS (Per-IP) ---"
    Write-Host " [1] Normal Traffic (Truy cap binh thuong - cham)"
    Write-Host " [2] Flash Crowd (Hang tram IP cung luc truy cap 1 URL dang nhap)"
    Write-Host " [3] HTTP Flood (Cache-Busting - Random Params)"
    Write-Host " --- DDoS (Multi-IP) ---"
    Write-Host " [4] Global Volumetric Flood (Random IPs toan cau)"
    Write-Host " [5] Coordinated Botnet (Nhieu IPs, muc tieu 1 URL tao loi 404)"
    Write-Host " [6] Subnet Attack (Nhieu IPs tu cung 1 Subnet /24)"
    Write-Host " [7] Thoat"
    Write-Host "============================================================" -ForegroundColor Cyan

    $choice = Read-Host "Chon kich ban (0-7)"

    switch ($choice) {
        '0' { Set-Params }
        '1' { Send-Normal }
        '2' { Send-FlashCrowd }
        '3' { Send-HTTPFlood }
        '4' { Send-GlobalVolumetricDDoS }
        '5' { Send-CoordinatedBotnet }
        '6' { Send-SubnetAttack }
        '7' { Write-Host "Dang thoat script..."; break }
        default { Write-Host "Lua chon khong hop le!" -ForegroundColor DarkRed }
    }
} while ($choice -ne '7')