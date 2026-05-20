# A2KF Blog — Guia de Configuração Completo

## Estrutura do Projeto

```
a2kf-blog/
├── index.html          ← Blog público (página inicial)
├── admin/
│   ├── login.html      ← Login do painel admin
│   ├── dashboard.html  ← Gerenciamento de posts
│   └── editor.html     ← Editor de posts (criar/editar)
```

---

## PASSO 1 — Configurar o Supabase (banco de dados gratuito)

### 1.1 Criar conta
1. Acesse https://supabase.com e crie sua conta (gratuito)
2. Clique em **"New Project"**
3. Escolha um nome (ex: `a2kf-blog`) e uma senha forte para o banco
4. Região: **South America (São Paulo)** — mais rápido para o Brasil

### 1.2 Criar a tabela de posts
No painel do Supabase, vá em **SQL Editor** e execute:

```sql
-- Criar tabela de posts
CREATE TABLE posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  excerpt TEXT,
  cover_url TEXT,
  category TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Política de segurança: leitura pública apenas de posts publicados
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts publicados são visíveis para todos"
  ON posts FOR SELECT
  USING (published = true);

CREATE POLICY "Admins autenticados podem fazer tudo"
  ON posts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

### 1.3 Criar usuário administrador
1. No painel Supabase, vá em **Authentication → Users**
2. Clique em **"Add User"**
3. Coloque seu email e uma senha forte
4. ✅ Este será o login do painel admin

### 1.4 Pegar as chaves do projeto
1. Vá em **Settings → API**
2. Copie:
   - **Project URL** (ex: `https://xxxxxxxxxxx.supabase.co`)
   - **anon / public key** (chave longa começando com `eyJ...`)

---

## PASSO 2 — Configurar as chaves nos arquivos

Abra os **4 arquivos** abaixo e substitua os placeholders:

| Arquivo | Linha a substituir |
|---|---|
| `index.html` | `SUPABASE_URL_AQUI` e `SUPABASE_ANON_KEY_AQUI` |
| `admin/login.html` | `SUPABASE_URL_AQUI` e `SUPABASE_ANON_KEY_AQUI` |
| `admin/dashboard.html` | `SUPABASE_URL_AQUI` e `SUPABASE_ANON_KEY_AQUI` |
| `admin/editor.html` | `SUPABASE_URL_AQUI` e `SUPABASE_ANON_KEY_AQUI` |

Exemplo:
```js
// Antes
const SUPABASE_URL = 'SUPABASE_URL_AQUI';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_AQUI';

// Depois
const SUPABASE_URL = 'https://xxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## PASSO 3 — Hospedar no Render (gratuito)

### 3.1 Subir o projeto no GitHub
1. Crie uma conta em https://github.com (gratuito)
2. Crie um novo repositório (ex: `a2kf-blog`)
3. Faça upload de todos os arquivos da pasta `a2kf-blog/`
   - Você pode arrastar e soltar os arquivos diretamente no GitHub

### 3.2 Criar o site no Render
1. Acesse https://render.com e crie sua conta (gratuito)
2. Clique em **"New → Static Site"**
3. Conecte ao seu repositório GitHub `a2kf-blog`
4. Configure:
   - **Name:** `a2kf-blog` (ou qualquer nome)
   - **Root Directory:** deixe vazio
   - **Publish Directory:** `.` (ponto, pasta raiz)
5. Clique em **"Create Static Site"**

### 3.3 Conectar seu domínio próprio
1. No Render, vá em **Settings → Custom Domains**
2. Adicione seu domínio (ex: `blog.a2kf.com.br`)
3. O Render vai mostrar um registro DNS para configurar
4. Acesse seu provedor de domínio e adicione o registro CNAME apontando para o Render
5. Em alguns minutos o SSL (HTTPS) é ativado automaticamente ✅

---

## PASSO 4 — Usar o painel admin

Acesse: `https://seudominio.com/admin/login.html`

| Funcionalidade | Como usar |
|---|---|
| **Criar post** | Dashboard → "Novo Post" → preencher e "Publicar" |
| **Editar post** | Dashboard → linha do post → "Editar" |
| **Publicar/despublicar** | Dashboard → botão "Publicar" / "Despublicar" |
| **Excluir post** | Dashboard → botão "Excluir" (pede confirmação) |
| **Salvar rascunho** | Editor → "Salvar Rascunho" (não aparece no blog) |
| **Auto-save** | O editor salva automaticamente a cada 3 segundos |
| **Ctrl+S** | Atalho para salvar no editor |

---

## Imagens nos posts

Para adicionar imagem de capa, você precisa de uma URL pública da imagem.
Opções gratuitas:
- **Imgur:** https://imgur.com — faça upload e copie o link direto
- **ImgBB:** https://imgbb.com — upload simples
- **Cloudinary:** https://cloudinary.com — melhor para uso profissional (plano gratuito generoso)

---

## Dúvidas frequentes

**O blog não carrega os posts?**
→ Verifique se as chaves do Supabase estão corretas em todos os arquivos.

**Login não funciona?**
→ Confira se criou o usuário em Authentication → Users no Supabase.

**Posts aparecem para todo mundo mesmo sem publicar?**
→ Verifique se as políticas RLS (Row Level Security) foram criadas no Passo 1.2.

**Quero atualizar o blog depois?**
→ Edite os arquivos no GitHub. O Render atualiza o site automaticamente em segundos.
