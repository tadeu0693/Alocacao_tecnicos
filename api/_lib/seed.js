export const TECNICOS_SEED = [
  { id: "t1", nome: "BRENO HAYAN LEITE GONCALVES", cargo: "TECNICO I", local: "Pindamonhangaba SP", tipo: "Implantação" },
  { id: "t2", nome: "DIEGO DA SILVA REZENDA", cargo: "ESPECIALISTA TECNICO", local: "São Paulo", tipo: "Implantação / Manutenção" },
  { id: "t3", nome: "FRANCISCO PAULO MARTINS SILVA", cargo: "TECNICO III", local: "Ceará", tipo: "Implantação" },
  { id: "t4", nome: "GUILHERME GABRIEL MEIRA NASCIMENTO", cargo: "TECNICO SISTEMAS JR", local: "São Paulo", tipo: "Implantação" },
  { id: "t5", nome: "GUILHERME SILVESTRE DEGHI", cargo: "AUXILIAR TECNICO", local: "São Paulo", tipo: "Implantação" },
  { id: "t6", nome: "JOELSON ROSA DA SILVA", cargo: "TECNICO I", local: "São Roque SP", tipo: "Implantação" },
  { id: "t7", nome: "JOSE RENATO RODRIGUES SILVA", cargo: "TECNICO I", local: "Ceará", tipo: "Implantação" },
  { id: "t8", nome: "JOSE ROBERTO DE MORAIS JUNIOR", cargo: "SUPERVISOR TECNICO", local: "São Paulo", tipo: "Implantação" },
  { id: "t9", nome: "RAFAEL PEREIRA VIEIRA", cargo: "ESPECIALISTA TECNICO", local: "Porto Alegre RS", tipo: "Implantação / Manutenção" },
  { id: "t10", nome: "RICARDO DONIZETE DE SOUSA", cargo: "TECNICO II", local: "São Roque SP", tipo: "Implantação" },
  { id: "t11", nome: "TAILON DA SILVA GRABIN", cargo: "TECNICO I", local: "Porto Alegre RS", tipo: "Implantação" },
  { id: "t12", nome: "VAGNER LIMA DA COSTA", cargo: "TECNICO II", local: "Porto Alegre RS", tipo: "Implantação" }
];

export const PROJETOS_SEED = [
  { id: "p1", nome: "Unilever", cliente: "Unilever", local: "São Roque SP" },
  { id: "p2", nome: "Charqueadas", cliente: "—", local: "Porto Alegre RS" },
  { id: "p3", nome: "Gerdau Cearense", cliente: "Gerdau", local: "Cearense" },
  { id: "p4", nome: "Canoas Park Shopping", cliente: "—", local: "Canoas ParqueShopping" },
  { id: "p5", nome: "Gerdau Pinda", cliente: "Gerdau", local: "Pindamonhangaba SP" }
];

export const ALLOC_SEED = [
  { tecnicoId: "t8", projetoId: "p1", tipo: "Implantação", obra: "Unilever", local: "São Roque SP", inicio: "2026-10-13", fim: "2026-10-30", notas: "AL-001" },
  { tecnicoId: "t10", projetoId: "p1", tipo: "Implantação", obra: "Unilever", local: "São Roque SP", inicio: "2026-10-13", fim: "2026-10-30", notas: "AL-002" },
  { tecnicoId: "t11", projetoId: "p2", tipo: "Implantação", obra: "Charqueadas", local: "Porto Alegre RS", inicio: "2026-10-05", fim: "2026-10-23", notas: "AL-003" },
  { tecnicoId: "t12", projetoId: "p2", tipo: "Implantação", obra: "Charqueadas", local: "Porto Alegre RS", inicio: "2026-10-05", fim: "2026-10-23", notas: "AL-004" },
  { tecnicoId: "t3", projetoId: "p3", tipo: "Implantação", obra: "Gerdau Cearense", local: "Cearense", inicio: "2026-10-01", fim: "2026-10-30", notas: "AL-005" },
  { tecnicoId: "t7", projetoId: "p3", tipo: "Implantação", obra: "Gerdau Cearense", local: "Cearense", inicio: "2026-10-01", fim: "2026-10-30", notas: "AL-006" },
  { tecnicoId: "t1", projetoId: "p4", tipo: "Implantação", obra: "Canoas Park Shopping", local: "Canoas ParqueShopping", inicio: "2026-10-05", fim: "2026-10-16", notas: "AL-007" },
  { tecnicoId: "t4", projetoId: "p5", tipo: "Implantação", obra: "Gerdau Pinda", local: "Pindamonhangaba SP", inicio: "2026-10-19", fim: "2026-10-30", notas: "AL-008" },
  { tecnicoId: "t12", projetoId: null, tipo: "Indisponibilidade", obra: "Férias", local: "—", inicio: "2026-09-01", fim: "2026-09-15", notas: "" },
  { tecnicoId: "t11", projetoId: null, tipo: "Indisponibilidade", obra: "Treinamento", local: "—", inicio: "2026-09-21", fim: "2026-09-25", notas: "" }
];
