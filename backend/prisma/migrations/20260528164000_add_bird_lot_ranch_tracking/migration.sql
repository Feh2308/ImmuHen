ALTER TABLE "BirdLot"
ADD COLUMN "ranchoAtual" TEXT NOT NULL DEFAULT 'Pinteiro',
ADD COLUMN "movimentacoes" JSONB,
ADD COLUMN "observacoes" TEXT NOT NULL DEFAULT '';
