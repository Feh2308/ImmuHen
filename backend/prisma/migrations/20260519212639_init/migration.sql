-- CreateTable
CREATE TABLE "Vaccinator" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vaccinator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" SERIAL NOT NULL,
    "vaccinator" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Detetization" (
    "id" SERIAL NOT NULL,
    "galpao" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "observacao" TEXT NOT NULL,
    "vaccineDate" TEXT NOT NULL,
    "detetizationDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Detetization_pkey" PRIMARY KEY ("id")
);
