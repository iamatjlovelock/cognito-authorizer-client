param(
    [switch]$ResetAvpPolicies
)

$ErrorActionPreference = "Stop"

if ($ResetAvpPolicies) {
    # Read config.json to get policy store ID
    $config = Get-Content -Path "config.json" | ConvertFrom-Json
    $policyStoreId = $config.cedar.policyStoreId
    $region = $config.cognito.region

    Write-Host "Resetting AVP policy store: $policyStoreId" -ForegroundColor Cyan

    # Read and parse policies from avp-policies.txt
    $policyContent = Get-Content -Path "avp-policies.txt" -Raw

    # Extract individual policies (each starts with @id)
    $policyMatches = [regex]::Matches($policyContent, '@id\("([^"]+)"\)\s*((?:permit|forbid)\s*\([^;]+;)')

    # Get existing policies from AVP
    Write-Host "Fetching existing policies..." -ForegroundColor Yellow
    $existingPolicies = aws verifiedpermissions list-policies `
        --policy-store-id $policyStoreId `
        --region $region | ConvertFrom-Json

    # Delete existing static policies
    foreach ($policy in $existingPolicies.policies) {
        if ($policy.definition.static) {
            Write-Host "  Deleting policy: $($policy.policyId)" -ForegroundColor DarkGray
            aws verifiedpermissions delete-policy `
                --policy-store-id $policyStoreId `
                --policy-id $policy.policyId `
                --region $region | Out-Null
        }
    }

    # Create new policies from file
    Write-Host "Creating policies from avp-policies.txt..." -ForegroundColor Yellow
    foreach ($match in $policyMatches) {
        $policyId = $match.Groups[1].Value
        $policyBody = $match.Groups[2].Value.Trim()

        Write-Host "  Creating policy: $policyId" -ForegroundColor DarkGray

        # Create the policy definition JSON
        $definition = @{
            static = @{
                description = $policyId
                statement = $policyBody
            }
        } | ConvertTo-Json -Depth 5 -Compress

        aws verifiedpermissions create-policy `
            --policy-store-id $policyStoreId `
            --definition $definition `
            --region $region | Out-Null
    }

    Write-Host "Policies loaded successfully!" -ForegroundColor Green
    Write-Host ""

    # Give AVP a moment to propagate
    Start-Sleep -Seconds 2
}

$auth = aws cognito-idp initiate-auth `
    --client-id 429dh9qd6q5sb3vl6ogqrg15ud `
    --auth-flow USER_PASSWORD_AUTH `
    --auth-parameters USERNAME=intern@example.com,PASSWORD=TestPass123! `
    --region us-east-1 | ConvertFrom-Json

$token = $auth.AuthenticationResult.IdToken
echo "Authenticated as USERNAME=intern@example.com"

echo "START TESTS"

echo "--------------------------------------"
echo "this should be allowed"
$body = @{
    token = $token
    action = "REVIEW"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "S"
                Region = "US"
                Client = "Acme"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5


Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"

echo "--------------------------------------"
echo "this should be denied"
$body = @{
    token = $token
    action = "REVIEW"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "M"
                Region = "US"
                Client = "Acme"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"



echo "--------------------------------------"
echo "--------------------------------------"
echo "--------------------------------------"
$auth = aws cognito-idp initiate-auth `
    --client-id 429dh9qd6q5sb3vl6ogqrg15ud `
    --auth-flow USER_PASSWORD_AUTH `
    --auth-parameters USERNAME=inhouse-counsel@example.com,PASSWORD=TestPass123! `
    --region us-east-1 | ConvertFrom-Json

$token = $auth.AuthenticationResult.IdToken


echo "Authenticated as inhouse-counsel@example.com"



echo "--------------------------------------"
echo "this should be allowed"
$body = @{
    token = $token
    action = "APPROVE"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "US"
                Client = "Acme"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5


Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"

echo "--------------------------------------"
echo "this should be denied"
$body = @{
    token = $token
    action = "ARCHIVE"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "US"
                Client = "Acme"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"


echo "--------------------------------------"
echo "--------------------------------------"
echo "--------------------------------------"
$auth = aws cognito-idp initiate-auth `
    --client-id 429dh9qd6q5sb3vl6ogqrg15ud `
    --auth-flow USER_PASSWORD_AUTH `
    --auth-parameters USERNAME=outside-counsel@example.com,PASSWORD=TestPass123! `
    --region us-east-1 | ConvertFrom-Json

$token = $auth.AuthenticationResult.IdToken


echo "Authenticated as outside-counsel@example.com"


echo "--------------------------------------"
echo "this should be allowed"
$body = @{
    token = $token
    action = "EDIT"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "IND"
                Client = "Acme"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5


Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"

echo "--------------------------------------"
echo "this should be denied"
$body = @{
    token = $token
    action = "EDIT"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "US"
                Client = "Acme"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"


echo "--------------------------------------"
echo "--------------------------------------"
echo "--------------------------------------"
$auth = aws cognito-idp initiate-auth `
    --client-id 429dh9qd6q5sb3vl6ogqrg15ud `
    --auth-flow USER_PASSWORD_AUTH `
    --auth-parameters USERNAME=matt@example.com,PASSWORD=TestPass123! `
    --region us-east-1 | ConvertFrom-Json

$token = $auth.AuthenticationResult.IdToken


echo "Authenticated as matt@example.com"


echo "--------------------------------------"
echo "this should be allowed"
$body = @{
    token = $token
    action = "EDIT"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "IND"
                Client = "Netflix"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5


Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"

echo "--------------------------------------"
echo "this should be denied"
$body = @{
    token = $token
    action = "EDIT"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "IND"
                Client = "Robinhood"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5


Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"


echo "--------------------------------------"
echo "--------------------------------------"
echo "--------------------------------------"
$auth = aws cognito-idp initiate-auth `
    --client-id 429dh9qd6q5sb3vl6ogqrg15ud `
    --auth-flow USER_PASSWORD_AUTH `
    --auth-parameters USERNAME=clare@example.com,PASSWORD=TestPass123! `
    --region us-east-1 | ConvertFrom-Json

$token = $auth.AuthenticationResult.IdToken


echo "Authenticated as clare@example.com"


echo "--------------------------------------"
echo "this should be allowed"
$body = @{
    token = $token
    action = "EDIT"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "US"
                Client = "GSA"
                Government = "TRUE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5


Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"

echo "--------------------------------------"
echo "this should be denied"
$body = @{
    token = $token
    action = "EDIT"
    resource = @{
        type = "Contract"
        id = "contract-123"
    }
    additionalEntities = @(
        @{
            uid = @{ type = "NAMESPACE::Contract"; id = "contract-123" }
            attrs = @{
                Size = "XXXL"
                Region = "US"
                Client = "GSA"
                Government = "FALSE"
                Status = "Draft"
            }
            parents = @()
        }
    )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:3000/authorize -Method POST -Body $body -ContentType "application/json"
