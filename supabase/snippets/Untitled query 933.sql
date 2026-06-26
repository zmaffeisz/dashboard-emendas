INSERT INTO profiles (id, nome, email, papel, created_at)
SELECT id, 'Patrick Teste', 'teste@teste.com', 'admin', now()
FROM auth.users
WHERE email = 'teste@teste.com';