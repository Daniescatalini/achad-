# Achadô

Central de ofertas de afiliados com Supabase, revisão por remessas e configuração de janelas do WhatsApp.

## Publicação na Vercel

Importe este repositório. Preset: Other. Diretório raiz: `./`. Sem comando de build. A configuração está em `vercel.json`.

## Banco

Em projeto novo, execute `schema.sql`; depois execute `002_remessas.sql`. Se já executou o primeiro, não repita. A URL e a chave pública Supabase estão na aplicação; nunca adicione uma chave privada.

## Estado atual

Login, preferências e revisão de ofertas usam Supabase quando a estrutura do banco estiver instalada. Demonstração separada usa dados fictícios locais. Remessas reais exigem a migração 002. Busca e disparos ainda não estão conectados. A agenda salva preferências; a fila exibe uma prévia de capacidade.

## Verificar regras

`node --test eligibility.test.mjs batch-rules.test.cjs`

Este repositório contém o aplicativo estático na raiz para publicação direta. Os arquivos SQL e de testes são excluídos da publicação pela configuração `.vercelignore`.

## Mercado Livre
Execute 003_mercadolivre.sql no Supabase. Configure MELI_CLIENT_ID, MELI_CLIENT_SECRET e MELI_ENCRYPTION_KEY (32 bytes aleatórios em base64) como segredos de produção na Vercel. Nunca registre seus valores no GitHub. Cadastre o retorno https://achado-omega.vercel.app/api/mercadolivre/callback no aplicativo Mercado Livre.

Entre com uma conta real no Achadô, abra Integrações e use Conectar Mercado Livre. Tokens são cifrados no servidor, vinculados ao usuário por RLS, e renovados sob bloqueio para evitar uso concorrente do refresh token.

A consulta por ID usa anúncios originais. Não confirma comissões, avaliações ou geração de links de afiliada. Busca automática e WhatsApp continuam pendentes.

Testes: `node --test *.test.*`.
