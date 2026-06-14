import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

export async function checkAdminPrivilege(): Promise<void> {
    const script = `
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = [Security.Principal.WindowsPrincipal]$identity
        $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        exit $(if ($isAdmin) { 0 } else { 1 })
    `

    // PowerShell EncodedCommand cần UTF-16LE
    const encoded = Buffer.from(script, 'utf16le').toString('base64')

    try {
        await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { windowsHide: true })
        console.info('[Privilege] Running with Administrator privileges ✅')
    } catch {
        throw new Error(
            '[Privilege] App cần chạy với quyền Administrator.\n' +
            'Hãy click chuột phải vào terminal và chọn "Run as administrator".'
        )
    }
}