CREATE TABLE `gestor_marca_import_map` (
  `id` int AUTO_INCREMENT NOT NULL,
  `marcaKey` varchar(200) NOT NULL,
  `marcaNome` varchar(100) NOT NULL,
  `gestorNome` varchar(200) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gestor_marca_import_map_id` PRIMARY KEY(`id`),
  CONSTRAINT `gestor_marca_import_map_marcaKey_unique` UNIQUE(`marcaKey`)
);
