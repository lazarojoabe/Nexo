# Arquitetura

O navegador fala somente com a API NestJS. Chaves Gemini e Supabase ficam no servidor. `shared` mantém os esquemas Zod que validam saídas do modelo. Questões são corrigidas exclusivamente pelo campo `correctOptionId`; IA jamais escolhe o gabarito.

Em produção, o JWT Supabase deve ser validado no guard de autenticação, e imagens devem ir para bucket privado. A API nunca registra textos integrais de redações. Limites de tamanho, contagem de imagens e limite diário protegem os endpoints de IA.
