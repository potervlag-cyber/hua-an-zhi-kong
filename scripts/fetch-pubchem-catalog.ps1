param(
    [int]$FirstCid = 1,
    [int]$LastCid = 1600,
    [string]$OutputPath = "db/pubchem-catalog.json"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ResolvedOutput = Join-Path $ProjectRoot $OutputPath
$Properties = "Title,IUPACName,MolecularFormula,MolecularWeight"
$Rows = [System.Collections.Generic.List[object]]::new()

for ($start = $FirstCid; $start -le $LastCid; $start += 80) {
    $end = [Math]::Min($start + 79, $LastCid)
    $ids = ($start..$end) -join ","
    $uri = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/$ids/property/$Properties/JSON"
    $response = Invoke-RestMethod -Uri $uri -TimeoutSec 60
    foreach ($property in $response.PropertyTable.Properties) {
        $Rows.Add($property)
    }
    Start-Sleep -Milliseconds 250
}

$payload = [ordered]@{
    source = "PubChem PUG REST"
    sourceUrl = "https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest"
    retrievedAt = (Get-Date).ToString("yyyy-MM-dd")
    cidRange = "$FirstCid-$LastCid"
    records = $Rows
}

$parent = Split-Path -Parent $ResolvedOutput
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($ResolvedOutput, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Saved $($Rows.Count) PubChem records to $ResolvedOutput"
