-- =============================================
-- EXECUTE NO SUPABASE SQL EDITOR
-- Adiciona campo slug na tabela posts
-- =============================================

-- 1. Adicionar coluna slug
ALTER TABLE posts ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Criar índice único para slug
CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_idx ON posts(slug);

-- 3. Gerar slugs para posts existentes (baseado no título)
UPDATE posts
SET slug = lower(
  regexp_replace(
    regexp_replace(
      translate(title,
        'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
        'aaaaaaeeeeiiiiooooouuuucAAAAAAAAEEEEIIIIOOOOOUUUUC'
      ),
    '[^a-zA-Z0-9\s-]', '', 'g'),
  '\s+', '-', 'g')
)
WHERE slug IS NULL;
