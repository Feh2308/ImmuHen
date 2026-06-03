-- CreateTable
CREATE TABLE "BirdLot" (
    "id" SERIAL NOT NULL,
    "lote" TEXT NOT NULL,
    "proprietario" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "linhagem" TEXT NOT NULL,
    "avesAlojadas" INTEGER NOT NULL,
    "dataAlojamento" TEXT NOT NULL,
    "idadeAtual" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirdLot_pkey" PRIMARY KEY ("id")
);
