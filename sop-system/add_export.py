import os
import re

# Páginas que precisam de exportação CSV
pages_config = {
    "TipoNegocio.tsx": {
        "import_check": "import * as XLSX",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "ativo", title: "Ativo" }',
        ],
        "data_var": "items",
        "filename": "tipo_negocio"
    },
    "TipoEstoque.tsx": {
        "import_check": "import * as XLSX",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "ativo", title: "Ativo" }',
        ],
        "data_var": "items",
        "filename": "tipo_estoque"
    },
    "Linhas.tsx": {
        "import_check": "import * as XLSX",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "ativo", title: "Ativo" }',
        ],
        "data_var": "items",
        "filename": "linhas"
    },
    "Modelos.tsx": {
        "import_check": "import * as XLSX",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "ativo", title: "Ativo" }',
        ],
        "data_var": "items",
        "filename": "modelos"
    },
    "Tamanhos.tsx": {
        "import_check": "import * as XLSX",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "ativo", title: "Ativo" }',
        ],
        "data_var": "items",
        "filename": "tamanhos"
    },
    "Recursos.tsx": {
        "import_check": "lucide-react",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "tipo", title: "Tipo" }',
            '{ key: "capacidadeHora", title: "Capacidade/Hora" }',
            '{ key: "status", title: "Status" }',
        ],
        "data_var": "recursos",
        "filename": "recursos"
    },
    "Membros.tsx": {
        "import_check": "lucide-react",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "email", title: "Email" }',
            '{ key: "cargo", title: "Cargo" }',
            '{ key: "departamento", title: "Departamento" }',
            '{ key: "status", title: "Status" }',
        ],
        "data_var": "membros",
        "filename": "membros"
    },
    "Paradas.tsx": {
        "import_check": "lucide-react",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "tipo", title: "Tipo" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "status", title: "Status" }',
        ],
        "data_var": "paradas",
        "filename": "paradas"
    },
    "Roteiros.tsx": {
        "import_check": "lucide-react",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "status", title: "Status" }',
        ],
        "data_var": "roteiros",
        "filename": "roteiros"
    },
    "DiasUteis.tsx": {
        "import_check": "lucide-react",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "ano", title: "Ano" }',
            '{ key: "mes", title: "Mês" }',
            '{ key: "diasUteis", title: "Dias Úteis" }',
        ],
        "data_var": "diasUteis",
        "filename": "dias_uteis"
    },
    "DeParaCodigos.tsx": {
        "import_check": "lucide-react",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "codigoOrigem", title: "Código Origem" }',
            '{ key: "codigoDestino", title: "Código Destino" }',
            '{ key: "descricao", title: "Descrição" }',
        ],
        "data_var": "dePara",
        "filename": "de_para"
    },
    "GestorMarca.tsx": {
        "import_check": "lucide-react",
        "import_add": 'import { exportToCsv } from "@/lib/exportCsv";',
        "button_search": r'<div className="flex justify-end">\s*<Dialog',
        "columns": [
            '{ key: "nome", title: "Nome" }',
            '{ key: "descricao", title: "Descrição" }',
            '{ key: "ativo", title: "Ativo" }',
        ],
        "data_var": "marcas",
        "filename": "gestor_marca"
    },
}

base_path = "client/src/pages/cadastros"

for filename, config in pages_config.items():
    filepath = os.path.join(base_path, filename)
    if not os.path.exists(filepath):
        print(f"Arquivo não encontrado: {filepath}")
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Verificar se já tem exportToCsv
    if 'exportToCsv' in content:
        print(f"Já tem exportToCsv: {filename}")
        continue
    
    # Adicionar import
    if config["import_check"] in content:
        content = content.replace(
            config["import_check"],
            f'{config["import_check"]}\n{config["import_add"]}' if 'import * as XLSX' in config["import_check"] else f'{config["import_check"]}\nimport {{ Download }} from "lucide-react";\n{config["import_add"]}'
        )
    
    # Salvar arquivo
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"Import adicionado: {filename}")

print("Concluído!")
