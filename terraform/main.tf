# Secrets
data "aws_secretsmanager_secret" "database" {
    name = "hotline/database"
}

data "aws_secretsmanager_secret" "bot_database" {
    name = "hotline/bot/database"
}

data "aws_secretsmanager_secret" "bot_api" {
    name = "hotline/bot/api"
}

data "aws_secretsmanager_secret" "discord" {
    name = "hotline/discord"
}
data "aws_secretsmanager_secret" "bot_discord" {
    name = "hotline/bot/discord"
}


# Policy
data "aws_iam_policy_document" "_" {
    statement {
        sid     = "1"
        actions = [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret"
        ]
        effect  = "Allow"

        resources = [
            data.aws_secretsmanager_secret.database.arn,
            data.aws_secretsmanager_secret.bot_database.arn,
            data.aws_secretsmanager_secret.bot_api.arn,
            data.aws_secretsmanager_secret.discord.arn,
            data.aws_secretsmanager_secret.bot_discord.arn,
        ]
    }
}

# User
resource "aws_iam_user" "_" {
    name = "bot-hotline-gg"
}

resource "aws_iam_access_key" "_" {
    user = aws_iam_user._.name
}

resource "aws_iam_user_policy" "_" {
    name   = "secrets_manager"
    user   = aws_iam_user._.name
    policy = data.aws_iam_policy_document._.json
}
