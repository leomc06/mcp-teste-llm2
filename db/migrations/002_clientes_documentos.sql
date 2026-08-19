BEGIN;

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS documento_tipo VARCHAR(4),
    ADD COLUMN IF NOT EXISTS documento_numero VARCHAR(20),
    ADD COLUMN IF NOT EXISTS rg VARCHAR(20),
    ADD COLUMN IF NOT EXISTS telefone_celular VARCHAR(20),
    ADD COLUMN IF NOT EXISTS telefone_whatsapp VARCHAR(20),
    ADD COLUMN IF NOT EXISTS endereco_rua VARCHAR(150),
    ADD COLUMN IF NOT EXISTS endereco_numero VARCHAR(10),
    ADD COLUMN IF NOT EXISTS endereco_bairro VARCHAR(100),
    ADD COLUMN IF NOT EXISTS endereco_cidade VARCHAR(100),
    ADD COLUMN IF NOT EXISTS endereco_estado CHAR(2),
    ADD COLUMN IF NOT EXISTS endereco_cep VARCHAR(9),
    ADD COLUMN IF NOT EXISTS genero VARCHAR(50),
    ADD COLUMN IF NOT EXISTS profissao VARCHAR(100);

ALTER TABLE clientes
    DROP CONSTRAINT IF EXISTS clientes_documento_tipo_valido;
ALTER TABLE clientes
    ADD CONSTRAINT clientes_documento_tipo_valido
        CHECK (documento_tipo IS NULL OR documento_tipo IN ('cpf', 'cnpj'));

ALTER TABLE clientes
    DROP CONSTRAINT IF EXISTS clientes_documento_numero_unico;
ALTER TABLE clientes
    ADD CONSTRAINT clientes_documento_numero_unico UNIQUE (documento_numero);

CREATE INDEX IF NOT EXISTS clientes_documento_numero_idx
    ON clientes (documento_numero);

-- Backfill de dados fictícios para os clientes já cadastrados no ambiente de teste.
UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '111.222.333-44', rg = '11.222.333-4',
    telefone_celular = '(11) 91111-2222', telefone_whatsapp = '(11) 91111-2222',
    endereco_rua = 'Rua das Acácias', endereco_numero = '120', endereco_bairro = 'Jardim das Flores',
    endereco_cidade = 'São Paulo', endereco_estado = 'SP', endereco_cep = '01310-100',
    genero = 'Feminino', profissao = 'Designer Gráfica'
WHERE email = 'ana@example.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '222.333.444-55', rg = '22.333.444-5',
    telefone_celular = '(21) 92222-3333', telefone_whatsapp = '(21) 92222-3333',
    endereco_rua = 'Rua do Catete', endereco_numero = '45', endereco_bairro = 'Catete',
    endereco_cidade = 'Rio de Janeiro', endereco_estado = 'RJ', endereco_cep = '22220-000',
    genero = 'Masculino', profissao = 'Analista de Sistemas'
WHERE email = 'bruno@example.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '333.444.555-66', rg = '33.444.555-6',
    telefone_celular = '(31) 93333-4444', telefone_whatsapp = '(31) 93333-4444',
    endereco_rua = 'Rua da Bahia', endereco_numero = '800', endereco_bairro = 'Centro',
    endereco_cidade = 'Belo Horizonte', endereco_estado = 'MG', endereco_cep = '30160-011',
    genero = 'Feminino', profissao = 'Advogada'
WHERE email = 'carla@example.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '444.555.666-77', rg = '44.555.666-7',
    telefone_celular = '(41) 94444-5555', telefone_whatsapp = '(41) 94444-5555',
    endereco_rua = 'Rua XV de Novembro', endereco_numero = '500', endereco_bairro = 'Centro',
    endereco_cidade = 'Curitiba', endereco_estado = 'PR', endereco_cep = '80020-310',
    genero = 'Feminino', profissao = 'Engenheira Civil'
WHERE email = 'fernanda@techcorp.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '555.666.777-88', rg = '55.666.777-8',
    telefone_celular = '(51) 95555-6666', telefone_whatsapp = '(51) 95555-6666',
    endereco_rua = 'Avenida Ipiranga', endereco_numero = '1000', endereco_bairro = 'Centro Histórico',
    endereco_cidade = 'Porto Alegre', endereco_estado = 'RS', endereco_cep = '90160-093',
    genero = 'Masculino', profissao = 'Enfermeiro'
WHERE email = 'rafael@techcorp.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '666.777.888-99', rg = '66.777.888-9',
    telefone_celular = '(71) 96666-7777', telefone_whatsapp = '(71) 96666-7777',
    endereco_rua = 'Avenida Sete de Setembro', endereco_numero = '300', endereco_bairro = 'Corredor da Vitória',
    endereco_cidade = 'Salvador', endereco_estado = 'BA', endereco_cep = '40080-001',
    genero = 'Feminino', profissao = 'Contadora'
WHERE email = 'patricia@gmail.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '777.888.999-00', rg = '77.888.999-0',
    telefone_celular = '(81) 97777-8888', telefone_whatsapp = '(81) 97777-8888',
    endereco_rua = 'Rua da Aurora', endereco_numero = '200', endereco_bairro = 'Boa Vista',
    endereco_cidade = 'Recife', endereco_estado = 'PE', endereco_cep = '50050-000',
    genero = 'Masculino', profissao = 'Professor'
WHERE email = 'marcos@gmail.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '888.999.000-11', rg = '88.999.000-1',
    telefone_celular = '(85) 98888-9999', telefone_whatsapp = '(85) 98888-9999',
    endereco_rua = 'Avenida Beira Mar', endereco_numero = '700', endereco_bairro = 'Meireles',
    endereco_cidade = 'Fortaleza', endereco_estado = 'CE', endereco_cep = '60165-121',
    genero = 'Feminino', profissao = 'Arquiteta'
WHERE email = 'juliana@outlook.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '999.000.111-22', rg = '99.000.111-2',
    telefone_celular = '(61) 99999-0000', telefone_whatsapp = '(61) 99999-0000',
    endereco_rua = 'SQN 210 Bloco A', endereco_numero = '210', endereco_bairro = 'Asa Norte',
    endereco_cidade = 'Brasília', endereco_estado = 'DF', endereco_cep = '70862-010',
    genero = 'Masculino', profissao = 'Nutricionista'
WHERE email = 'eduardo@outlook.com';

UPDATE clientes SET
    documento_tipo = 'cpf', documento_numero = '000.111.222-33', rg = '00.111.222-3',
    telefone_celular = '(19) 90000-1111', telefone_whatsapp = '(19) 90000-1111',
    endereco_rua = 'Rua Barão de Jaguara', endereco_numero = '900', endereco_bairro = 'Centro',
    endereco_cidade = 'Campinas', endereco_estado = 'SP', endereco_cep = '13015-002',
    genero = 'Prefere não informar', profissao = 'Fisioterapeuta'
WHERE email = 'camila@techcorp.com';

COMMIT;
