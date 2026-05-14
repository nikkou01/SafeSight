$preferredAliases = @(
    'Wi-Fi',
    'Wi-Fi 2',
    'Wireless Network Connection',
    'Ethernet'
)

foreach ($alias in $preferredAliases) {
    $config = Get-NetIPConfiguration -InterfaceAlias $alias -ErrorAction SilentlyContinue
    if ($config -and $config.IPv4Address) {
        foreach ($address in $config.IPv4Address) {
            if ($address.IPAddress -and $address.IPAddress -ne '127.0.0.1' -and $address.IPAddress -notlike '169.254.*') {
                Write-Output $address.IPAddress
                exit 0
            }
        }
    }
}

$fallback = Get-NetIPConfiguration |
    Where-Object {
        $_.NetAdapter.Status -eq 'Up' -and
        $_.NetAdapter.HardwareInterface -and
        $_.IPv4DefaultGateway
    } |
    Sort-Object InterfaceMetric |
    ForEach-Object { $_.IPv4Address.IPAddress } |
    Where-Object {
        $_ -and $_ -ne '127.0.0.1' -and $_ -notlike '169.254.*'
    } |
    Select-Object -First 1

if ($fallback) {
    Write-Output $fallback
} else {
    Write-Output '127.0.0.1'
}