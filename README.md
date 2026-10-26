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
