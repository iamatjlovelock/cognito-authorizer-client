// Test Cedar policies for Cognito authorization

// Interns can review small contracts
@id("intern-access-S")
permit (
    principal in NAMESPACE::CognitoGroup::"legal-interns",
    action == NAMESPACE::Action::"REVIEW",
    resource is NAMESPACE::Contract
)
when { resource.Size == "S" };
