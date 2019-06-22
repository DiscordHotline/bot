output "access_key_id" {
    value = aws_iam_access_key._.id
}

output "secret_access_key" {
    value = aws_iam_access_key._.secret
}
