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



