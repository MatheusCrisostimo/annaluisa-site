export const CONTRACT_FIELDS = {
  cliente_nome: { label: 'Nome da contratante', kind: 'text', source: 'proposal', max: 120 },
  cliente_documento: { label: 'CPF ou CNPJ da contratante', kind: 'text', source: 'input', max: 30 },
  cliente_qualificacao: { label: 'Qualificação da contratante', kind: 'text', source: 'input', max: 200 },
  cliente_endereco: { label: 'Endereço da contratante', kind: 'long', source: 'input', max: 500 },
  prestadora_nome: { label: 'Nome ou razão social da prestadora', kind: 'text', source: 'input', max: 160 },
  prestadora_documento: { label: 'CPF ou CNPJ da prestadora', kind: 'text', source: 'input', max: 30 },
  prestadora_qualificacao: { label: 'Qualificação da prestadora', kind: 'text', source: 'input', max: 200 },
  prestadora_endereco: { label: 'Endereço da prestadora', kind: 'long', source: 'input', max: 500 },
  proposta_protocolo: { label: 'Protocolo do pedido', kind: 'text', source: 'proposal', max: 128 },
  servico: { label: 'Serviço da proposta', kind: 'text', source: 'proposal', max: 100 },
  servicos: { label: 'Serviços contratados', kind: 'long', source: 'input', max: 3000 },
  data_evento: { label: 'Data do evento', kind: 'date', source: 'input', max: 10 },
  cidade_evento: { label: 'Cidade do evento', kind: 'text', source: 'input', max: 100 },
  hora_pronta: { label: 'Horário em que a cliente precisa estar pronta', kind: 'time', source: 'input', max: 5 },
  local_cerimonia: { label: 'Local da cerimônia', kind: 'long', source: 'input', max: 500 },
  local_atendimento: { label: 'Local do atendimento', kind: 'long', source: 'input', max: 500 },
  valor_total: { label: 'Valor total da proposta', kind: 'text', source: 'proposal', max: 60 },
  condicoes_pagamento: { label: 'Condições de pagamento', kind: 'long', source: 'input', max: 3000 },
  cidade_assinatura: { label: 'Cidade da assinatura', kind: 'text', source: 'input', max: 100 },
  data_emissao: { label: 'Data de emissão', kind: 'date', source: 'input', max: 10 },
  foro: { label: 'Comarca definida no modelo', kind: 'text', source: 'input', max: 160 }
};

export const STARTER_CONTRACT = `# Contrato de prestação de serviços

## Identificação das partes
Contratante: {{cliente_nome}}, {{cliente_qualificacao}}, CPF ou CNPJ {{cliente_documento}}, com endereço em {{cliente_endereco}}.
Contratada: {{prestadora_nome}}, {{prestadora_qualificacao}}, CPF ou CNPJ {{prestadora_documento}}, com endereço em {{prestadora_endereco}}.

## Objeto
Serviços contratados:
{{servicos}}

Data do evento: {{data_evento}}.
Local da cerimônia: {{local_cerimonia}}.
Local do atendimento: {{local_atendimento}}.

## Obrigações das partes
[[Insira as cláusulas revisadas sobre as obrigações de cada parte.]]

## Preço e pagamento
Valor total: {{valor_total}}.
Condições de pagamento:
{{condicoes_pagamento}}

## Cancelamento e reagendamento
[[Insira as cláusulas revisadas sobre cancelamento e reagendamento.]]

## Condições gerais e proteção de dados
[[Insira as cláusulas revisadas sobre condições gerais e proteção de dados.]]

## Foro
[[Insira a cláusula revisada. Use {{foro}} se a comarca variar.]]

{{cidade_assinatura}}, {{data_emissao}}.

________________________________________
{{cliente_nome}} — Contratante

________________________________________
{{prestadora_nome}} — Contratada
`;

export function contractTokens(template) {
  return [...new Set(Array.from(template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g), match => match[1]))];
}
