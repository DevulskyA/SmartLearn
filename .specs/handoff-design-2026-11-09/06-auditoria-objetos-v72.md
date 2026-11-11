# Auditoria por objetos: V7.2 (prévia do pacote) contra o app

Largura 1440px, tema Paper. Cada tela foi percorrida em um navegador: todo elemento visível com texto, controle, título, tabela, gráfico ou forma foi medido (tipo, texto, posição, tamanho, cor, fonte, raio, sombra). Dados: a prévia traz dados ilustrativos; o app, dados sintéticos de desenvolvimento. Por isso só se comparam rótulos fixos (títulos, botões, cabeçalhos, campos); números e datas contam só por quantidade.

## Resumo

| Tela | Objetos V7.2 | Objetos app | Faltam no app | Só no app | Com diferença |
|---|---:|---:|---:|---:|---:|
| shell | 31 | 27 | 12 | 8 | 4 |
| today | 67 | 216 | 37 | 102 | 12 |
| materials | 37 | 35 | 12 | 8 | 4 |
| plan | 164 | 77 | 86 | 11 | 6 |
| stats | 520 | 301 | 180 | 49 | 8 |
| settings | 121 | 44 | 84 | 12 | 2 |
| account | 10 | 15 | 5 | 9 | 0 |

## Casca (barra lateral e cabeçalho)

| Tipo | V7.2 | App |
|---|---:|---:|
| a | 2 | 2 |
| button | 8 | 7 |
| label | 1 | 0 |
| select | 1 | 0 |
| svg | 7 | 7 |
| text | 12 | 11 |
| **Total** | **31** | **27** |

Rótulos fixos casados: 9. Faltam no app: 12. Só existem no app: 8. Casados com diferença visual: 4.

**Faltam no app (existem na V7.2)**

- text “PRÉVIA EXECUTÁVEL” em (20,12) 97x16
- label “Aulas” em (1101,7) 188x25
- select “200” em (1139,7) 150x25
- button “Restaurar demonstração” em (1299,9) 121x22
- a “SmartLearn, ir para Hoje” em (26,56) 176x33
- button “Alternar tema claro e escuro” em (1376,55) 36x36
- button “Hoje” em (16,170) 183x45
- button “Materiais” em (16,221) 183x45
- button “Plano” em (16,272) 183x45
- button “Estatísticas” em (16,323) 183x45
- button “Configurações” em (16,656) 183x44
- button “Conta” em (16,704) 183x44

**Só no app (não existem na V7.2)**

- a “SmartLearn - ir para Hoje” em (26,16)
- button “Alternar tema rápido” em (1376,15)
- button “” em (16,130)
- button “” em (16,181)
- button “” em (16,232)
- button “” em (16,283)
- button “” em (16,643)
- button “” em (16,691)

**Existem nos dois, mas diferem**

- text “Hoje”: posição ref(63,184) app(63,142)
- text “Materiais”: posição ref(63,235) app(63,193)
- text “Plano”: posição ref(63,286) app(63,244)
- text “Estatísticas”: posição ref(63,337) app(63,296)

## today

| Tipo | V7.2 | App |
|---|---:|---:|
| button | 20 | 46 |
| h1 | 1 | 1 |
| h2 | 3 | 4 |
| h3 | 9 | 20 |
| input | 0 | 17 |
| label | 0 | 17 |
| role:status | 0 | 1 |
| summary | 0 | 3 |
| text | 34 | 107 |
| **Total** | **67** | **216** |

Rótulos fixos casados: 14. Faltam no app: 37. Só existem no app: 102. Casados com diferença visual: 12.

**Faltam no app (existem na V7.2)**

- text “SEU ESTUDO, EM CONTINUIDADE” em (262,144) 948x16
- text “Filtração glomerular” em (291,346) 460x28
- button “Começar revisão →” em (1218,333) 146x42
- text “Revisão pendente” em (691,500) 104x23
- h3 “Filtração glomerular” em (282,538) 513x21
- button “Revisar agora →” em (282,618) 106x33
- button “Ver aula” em (396,618) 44x33
- text “Revisão pendente” em (691,704) 104x23
- h3 “Características das membranas celulares” em (282,742) 513x21
- button “Revisar agora →” em (282,822) 106x33
- button “Ver aula” em (396,822) 44x33
- text “Patologia” em (282,903) 84x34
- text “Revisão pendente” em (691,908) 104x23
- button “Revisar agora →” em (282,1026) 106x33
- button “Ver aula” em (396,1026) 44x33
- h3 “Volume e composição dos fluidos corporais” em (861,537) 513x21
- button “Revisar agora →” em (861,617) 106x33
- button “Ver aula” em (975,617) 44x33
- text “Hoje” em (1335,703) 39x23
- h3 “Transporte através da membrana celular” em (861,741) 513x21
- button “Revisar agora →” em (861,821) 106x33
- button “Ver aula” em (975,821) 44x33
- text “Hoje” em (1335,907) 39x23
- button “Revisar agora →” em (861,1025) 106x33
- button “Ver aula” em (975,1025) 44x33
- h2 “Próximas revisões” em (262,1103) 173x29
- text “Bioquímica” em (282,1166) 93x34
- h3 “Metabolismo energético” em (282,1209) 331x21
- button “Revisar agora →” em (282,1289) 106x33
- button “Ver aula” em (396,1289) 44x33
- text “Semiologia” em (663,1166) 93x34
- h3 “Exame cardiovascular” em (663,1209) 331x21
- button “Revisar agora →” em (663,1289) 106x33
- button “Ver aula” em (777,1289) 44x33
- h3 “Plexo braquial” em (1043,1209) 331x21
- button “Revisar agora →” em (1043,1289) 106x33
- button “Ver aula” em (1158,1289) 44x33

**Só no app (não existem na V7.2)**

- button “Resumo do Dia” em (1311,173)
- button “Começar agora” em (923,405)
- button “Revisar uma por vez” em (1220,406)
- summary “Patologia GeralInflamação aguda5 revisões atrasadas · R1 a R” em (263,576)
- h3 “Inflamação aguda” em (353,768)
- h3 “Inflamação aguda” em (353,971)
- h3 “Inflamação aguda” em (353,1173)
- h3 “Inflamação aguda” em (353,1376)
- h3 “Inflamação aguda” em (353,1579)
- h3 “Inflamação aguda” em (916,840)
- label “Revisão feita” em (297,827)
- label “Revisão feita” em (297,1030)
- label “Revisão feita” em (297,1233)
- label “Revisão feita” em (297,1436)
- label “Revisão feita” em (297,1638)
- label “Revisão feita” em (282,838)
- label “Revisão feita” em (297,2545)
- label “Revisão feita” em (297,2748)
- label “Revisão feita” em (297,3087)
- label “Revisão feita” em (297,3290)
- label “Revisão feita” em (297,3493)
- label “Revisão feita” em (282,3098)
- label “Revisão feita” em (861,700)
- label “Revisão feita” em (861,899)
- label “Revisão feita” em (282,3406)
- … e mais 77

**Existem nos dois, mas diferem**

- h2 “Vencidas”: posição ref(262,431) app(262,531)
- button “Adiar vencidas”: posição ref(727,431) app(727,530)
- text “Fisiologia”: posição ref(282,495) app(338,733)
- text “Fisiologia”: posição ref(282,699) app(305,2851)
- h3 “Inflamação aguda”: posição ref(282,946) app(305,637)
- h2 “Para hoje”: posição ref(841,431) app(841,530)
- text “Fisiologia”: posição ref(861,494) app(353,2982)
- text “Hoje”: posição ref(1335,499) app(660,247); tamanho ref 39x23 app 335x20; fundo ref rgb(250, 240, 221) app rgba(0, 0, 0, 0); cor do texto ref rgb(121, 82, 23) app rgb(76, 38, 182); corpo ref 11px app 12.8px; raio ref 6px app 0px
- text “Fisiologia”: posição ref(861,698) app(353,3185)
- text “Farmacologia”: posição ref(861,902) app(305,2308)
- h3 “Farmacocinética: absorção e distribuição”: posição ref(861,945) app(305,2355)
- text “Anatomia”: posição ref(1043,1166) app(338,2993)

## materials

| Tipo | V7.2 | App |
|---|---:|---:|
| button | 7 | 7 |
| h1 | 1 | 1 |
| h2 | 1 | 1 |
| h3 | 1 | 1 |
| input | 2 | 1 |
| label | 2 | 2 |
| li | 3 | 3 |
| role:status | 1 | 1 |
| select | 1 | 0 |
| svg | 1 | 2 |
| text | 17 | 16 |
| **Total** | **37** | **35** |

Rótulos fixos casados: 10. Faltam no app: 12. Só existem no app: 8. Casados com diferença visual: 4.

**Faltam no app (existem na V7.2)**

- input “Arquivo PDF” em (1218,326) 26x42
- text “Buscar na biblioteca” em (280,544) 614x16
- input “Título do PDF ou documento” em (280,564) 614x38
- label “OrganizarOrdem originalNome (A–Z)Nome (Z–A)Mais páginas prim” em (907,542) 311x61
- text “Organizar” em (907,542) 311x16
- select “original” em (907,562) 311x40
- button “Abrir Costanzo — Fisiologia” em (1191,656) 96x36
- button “Remover Costanzo — Fisiologia” em (1301,657) 70x33
- button “Abrir Guyton & Hall — Fisiologia Médica” em (1191,745) 96x36
- button “Remover Guyton & Hall — Fisiologia Médica” em (1301,747) 70x33
- button “Abrir Moore — Anatomia Clínica” em (1191,834) 96x36
- button “Remover Moore — Anatomia Clínica” em (1301,836) 70x33

**Só no app (não existem na V7.2)**

- input “Título do documento” em (262,528)
- label “Organizar” em (963,505)
- button “Abrir Moore - Anatomia Clinica.pdf” em (1191,633)
- button “Remover Moore - Anatomia Clinica.pdf” em (1301,634)
- button “Abrir Guyton & Hall - Fisiologia Medica.pdf” em (1191,722)
- button “Remover Guyton & Hall - Fisiologia Medica.pdf” em (1301,724)
- button “Abrir Costanzo Physiology, 7th edition.pdf” em (1191,811)
- button “Remover Costanzo Physiology, 7th edition.pdf” em (1301,813)

**Existem nos dois, mas diferem**

- label “Buscar na biblioteca”: posição ref(280,544) app(262,505); tamanho ref 614x59 app 689x16; cor do texto ref rgb(32, 38, 64) app rgb(83, 96, 119); corpo ref 12px app 10px
- text “Disponível para preparar resumos”: posição ref(339,766) app(339,653)
- text “Moore - Anatomia Clinica.pdf”: posição ref(339,833) app(339,631)
- text “Disponível para preparar resumos”: posição ref(339,855) app(339,743)

## plan

| Tipo | V7.2 | App |
|---|---:|---:|
| button | 27 | 12 |
| h1 | 1 | 1 |
| input | 1 | 1 |
| label | 2 | 1 |
| role:status | 1 | 0 |
| select | 5 | 0 |
| svg | 21 | 5 |
| text | 106 | 57 |
| **Total** | **164** | **77** |

Rótulos fixos casados: 11. Faltam no app: 86. Só existem no app: 11. Casados com diferença visual: 6.

**Faltam no app (existem na V7.2)**

- text “CONTEÚDOS E HISTÓRICO” em (262,144) 908x16
- button “Disciplinas” em (1186,205) 92x40
- button “Página anterior” em (1323,279) 32x32
- button “Próxima página” em (1362,279) 32x32
- select “Filtrar por disciplina” em (262,331) 277x42
- select “Filtrar por estado” em (547,331) 277x42
- select “Filtrar por período” em (832,331) 277x42
- select “Ordenar aulas” em (1117,331) 277x42
- text “Suas aulas” em (283,406) 68x16
- text “Abra uma linha para estudar ou editar” em (1125,406) 248x16
- text “Bioquímica” em (283,457) 93x34
- text “Metabolismo energético” em (438,454) 683x18
- text “Estudo registrado” em (1169,462) 104x23
- button “Abrir Metabolismo energético” em (1341,458) 32x32
- text “Características das membranas celulares” em (438,533) 683x18
- text “Estudo registrado” em (1171,541) 104x23
- button “Abrir Características das membranas celulares” em (1341,537) 32x32
- text “Revisar hoje” em (1205,620) 76x23
- button “Abrir Farmacocinética: absorção e distribuição” em (1341,616) 32x32
- text “Transporte através da membrana celular” em (438,691) 683x18
- text “Estudo registrado” em (1169,699) 104x23
- button “Abrir Transporte através da membrana celular” em (1341,695) 32x32
- text “Estudo registrado” em (1170,778) 104x23
- button “Abrir Farmacocinética: absorção e distribuição” em (1341,774) 32x32
- text “Fisiologia” em (283,852) 84x34
- text “Características das membranas celulares” em (438,849) 683x18
- text “Revisão vencida” em (1177,857) 95x23
- button “Abrir Características das membranas celulares” em (1341,853) 32x32
- text “Patologia” em (283,931) 84x34
- text “Revisão vencida” em (1178,936) 95x23
- button “Abrir Inflamação aguda” em (1341,932) 32x32
- text “Plexo braquial” em (438,1007) 683x18
- text “Estudo registrado” em (1169,1015) 104x23
- button “Abrir Plexo braquial” em (1341,1011) 32x32
- text “Patologia” em (283,1089) 84x34
- text “Inflamação aguda” em (438,1086) 683x18
- text “Estudo registrado” em (1168,1094) 104x23
- button “Abrir Inflamação aguda” em (1341,1090) 32x32
- text “Bioquímica” em (283,1168) 93x34
- text “Metabolismo energético” em (438,1165) 683x18
- text “Estudo registrado” em (1168,1173) 104x23
- button “Abrir Metabolismo energético” em (1341,1169) 32x32
- text “Fisiologia” em (283,1247) 84x34
- text “Controle da pressão arterial” em (438,1244) 683x18
- text “Estudo registrado” em (1170,1252) 104x23
- button “Abrir Controle da pressão arterial” em (1341,1248) 32x32
- text “Plexo braquial” em (438,1323) 683x18
- text “Estudo registrado” em (1169,1331) 104x23
- button “Abrir Plexo braquial” em (1341,1327) 32x32
- text “Semiologia” em (283,1405) 93x34
- text “Exame cardiovascular” em (438,1402) 683x18
- text “Estudo registrado” em (1178,1410) 104x23
- button “Abrir Exame cardiovascular” em (1341,1406) 32x32
- text “Anatomia” em (283,1484) 85x34
- text “Mediastino e relações anatômicas” em (438,1481) 683x18
- text “Estudo registrado” em (1178,1489) 104x23
- button “Abrir Mediastino e relações anatômicas” em (1341,1485) 32x32
- text “Semiologia” em (283,1565) 93x34
- text “Exame cardiovascular” em (438,1562) 683x18
- text “Estudo registrado” em (1222,1556) 104x23
- … e mais 26

**Só no app (não existem na V7.2)**

- button “Gerenciar disciplinas” em (1130,165)
- button “Expandir detalhes: AVC isquêmico: reconhecimento e conduta i” em (1341,379)
- button “Expandir detalhes: Ausculta cardíaca: bulhas e sopros” em (1341,460)
- button “Expandir detalhes: Anti-hipertensivos: classes e mecanismos” em (1341,539)
- button “Expandir detalhes: Cefaleias primárias” em (1341,618)
- button “Expandir detalhes: Potencial de ação neuronal” em (1341,697)
- button “Expandir detalhes: Farmacocinética: absorção e distribuição” em (1341,778)
- button “Expandir detalhes: Coração: câmaras, valvas e irrigação” em (1341,859)
- button “Expandir detalhes: Fisiologia renal: filtração glomerular” em (1341,940)
- button “Expandir detalhes: Plexo braquial: raízes, troncos e nervos” em (1341,1021)
- button “Expandir detalhes: Inflamação aguda” em (1341,1100)

**Existem nos dois, mas diferem**

- text “Fisiologia”: posição ref(283,536) app(283,696)
- text “Farmacologia”: posição ref(283,615) app(283,538)
- text “Fisiologia”: posição ref(283,694) app(283,939)
- text “Inflamação aguda”: posição ref(438,928) app(438,1096)
- text “Anatomia”: posição ref(283,1010) app(283,858)
- text “Anatomia”: posição ref(283,1326) app(283,1020)

## stats

| Tipo | V7.2 | App |
|---|---:|---:|
| button | 54 | 7 |
| h1 | 1 | 1 |
| h2 | 7 | 4 |
| input | 3 | 0 |
| label | 11 | 2 |
| li | 6 | 5 |
| role:meter | 6 | 0 |
| role:status | 1 | 1 |
| select | 8 | 0 |
| shape | 6 | 6 |
| summary | 1 | 0 |
| svg | 25 | 9 |
| table | 3 | 2 |
| td | 182 | 132 |
| text | 187 | 96 |
| th | 19 | 36 |
| **Total** | **520** | **301** |

Rótulos fixos casados: 8. Faltam no app: 180. Só existem no app: 49. Casados com diferença visual: 8.

**Faltam no app (existem na V7.2)**

- text “ESTATÍSTICAS DE ESTUDO” em (240,130) 695x16
- h1 “Análise de desempenho” em (240,151) 695x42
- label “PeríodoÚltimos 30 diasÚltimos 90 diasÚltimo anoTodo o histór” em (956,172) 190x57
- text “Período” em (956,172) 190x16
- select “Período das estatísticas” em (956,191) 190x37
- label “Buscar” em (1156,157) 260x72
- text “Buscar” em (1156,157) 260x16
- input “Buscar na análise completa” em (1156,176) 260x37
- text “Desempenho geral” em (296,290) 121x15
- text “Questões resolvidas” em (531,290) 110x15
- text “Disciplinas com dados” em (769,290) 114x15
- text “Disciplinas em atenção” em (1007,290) 160x15
- text “Revisões concluídas” em (1245,290) 109x15
- h2 “Panorama por disciplina” em (257,420) 250x21
- button “Ver todas (6)” em (762,420) 101x31
- label “Ordem” em (688,471) 39x19
- select “Ordem do panorama” em (735,465) 128x29
- button “1Bioquímica87,8%523 questões” em (257,500) 606x31
- text “Bioquímica” em (285,508) 249x15
- button “2Anatomia79,6%1.068 questões” em (257,533) 606x31
- button “3Semiologia76,3%287 questões” em (257,566) 606x31
- text “Semiologia” em (285,574) 249x15
- button “4Patologia65,9%531 questões” em (257,599) 606x31
- text “Patologia” em (285,607) 249x15
- button “5Fisiologia61%2.546 questões” em (257,632) 606x31
- button “6Farmacologia53,7%681 questões” em (257,665) 606x31
- button “Página anterior do panorama” em (777,711) 28x27
- button “Próxima página do panorama” em (835,711) 28x27
- h2 “Onde preciso melhorar” em (909,420) 258x21
- button “Farmacologia681 questões · Atenção53,7%” em (909,472) 490x54
- text “Farmacologia” em (945,484) 389x16
- button “Fisiologia2.546 questões · Atenção61%” em (909,526) 490x54
- text “Fisiologia” em (945,538) 389x16
- button “Patologia531 questões · Adequado65,9%” em (909,580) 490x54
- text “Patologia” em (945,592) 389x16
- button “Semiologia287 questões · Adequado76,3%” em (909,634) 490x54
- text “Semiologia” em (945,646) 389x16
- button “Ver ranking completo de dificuldades” em (909,712) 202x26
- h2 “Evolução do desempenho” em (257,788) 303x21
- button “Volume” em (1345,789) 54x30
- label “Disciplina” em (257,841) 1143x28
- select “Disciplina no gráfico” em (308,841) 1091x28
- summary “Consultar todos os valores do gráfico” em (257,1128) 1143x16
- table “Semana iniciadaQuestõesAcertosAproveitamento10/08/2026248173” em (257,1152) 1143x734
- th “Semana iniciada” em (257,1152) 352x40
- th “Questões” em (609,1152) 229x40
- th “Acertos” em (838,1152) 210x40
- th “Aproveitamento” em (1048,1152) 352x40
- h2 “Melhores matérias” em (253,1192) 182x19
- button “1Bioquímica87,8%” em (253,1258) 182x36
- text “Bioquímica” em (282,1268) 101x14
- button “2Anatomia79,6%” em (253,1294) 182x36
- text “Anatomia” em (282,1304) 101x14
- button “3Semiologia76,3%” em (253,1330) 182x36
- text “Semiologia” em (282,1340) 101x14
- button “Ver ranking completo” em (253,1377) 182x34
- h2 “Matérias para revisar” em (253,1455) 182x38
- text “Menores desempenhos observados.” em (253,1496) 182x29
- button “1Farmacologia53,7%” em (253,1538) 182x36
- text “Farmacologia” em (282,1549) 101x14
- … e mais 120

**Só no app (não existem na V7.2)**

- h1 “Estatísticas” em (262,104)
- label “” em (1252,139)
- label “” em (1227,471)
- h2 “Desempenho por disciplina” em (285,471)
- table “” em (285,508)
- table “” em (285,1360)
- th “Disciplina” em (285,508)
- th “Disciplina” em (285,1360)
- button “Disciplina” em (299,520)
- th “Desempenho” em (521,508)
- th “Evidência” em (674,508)
- button “Ordenar por evidência” em (688,520)
- th “Tendência” em (819,508)
- button “Tendência” em (880,520)
- button “Ver no Plano” em (368,1117)
- h2 “Evolução geral” em (1047,482)
- h2 “Distribuição do desempenho” em (1047,823)
- h2 “Exercícios resolvidos · histórico completo” em (285,1301)
- th “Conteúdo” em (500,1360)
- th “Q” em (1047,1360)
- th “A” em (1125,1360)
- th “Nota %” em (1202,1360)
- th “Anatomia” em (285,1400)
- th “Anatomia” em (285,1450)
- th “Anatomia” em (285,1500)
- … e mais 24

**Existem nos dois, mas diferem**

- text “Anatomia”: posição ref(285,541) app(299,789); tamanho ref 249x15 app 85x34; fundo ref rgba(0, 0, 0, 0) app color(srgb 0.769176 0.834824 0.978824); corpo ref 11px app 12px; raio ref 0px app 7px
- text “Fisiologia”: tamanho ref 249x15 app 84x34; fundo ref rgba(0, 0, 0, 0) app color(srgb 0.769176 0.834824 0.978824); corpo ref 11px app 12px; raio ref 0px app 7px
- text “Farmacologia”: posição ref(285,673) app(299,580); tamanho ref 249x15 app 106x34; fundo ref rgba(0, 0, 0, 0) app color(srgb 0.769176 0.834824 0.978824); corpo ref 11px app 12px; raio ref 0px app 7px
- button “Desempenho”: posição ref(1264,789) app(535,520); tamanho ref 80x30 app 97x30; fundo ref rgb(100, 55, 227) app rgba(0, 0, 0, 0); cor do texto ref rgb(255, 255, 255) app rgb(76, 38, 182); raio ref 0px app 5px
- button “Por disciplina”: posição ref(479,1267) app(267,382); fundo ref rgb(100, 55, 227) app rgb(255, 255, 255); cor do texto ref rgb(255, 255, 255) app rgb(100, 55, 227); corpo ref 11px app 12px; raio ref 8px app 7px
- button “Por conteúdo”: posição ref(581,1267) app(378,382); fundo ref rgb(233, 226, 255) app rgba(0, 0, 0, 0); cor do texto ref rgb(76, 38, 182) app rgb(83, 96, 119); corpo ref 11px app 12px; raio ref 8px app 7px
- text “Disciplina”: posição ref(475,1311) app(303,527); tamanho ref 241x16 app 61x16
- text “Tendência”: posição ref(939,1311) app(884,527); tamanho ref 178x16 app 62x16

## settings

| Tipo | V7.2 | App |
|---|---:|---:|
| button | 27 | 4 |
| h1 | 1 | 1 |
| h2 | 4 | 6 |
| h3 | 3 | 0 |
| input | 1 | 1 |
| label | 2 | 2 |
| role:status | 0 | 1 |
| select | 1 | 0 |
| shape | 24 | 1 |
| svg | 0 | 2 |
| text | 58 | 26 |
| **Total** | **121** | **44** |

Rótulos fixos casados: 4. Faltam no app: 84. Só existem no app: 12. Casados com diferença visual: 2.

**Faltam no app (existem na V7.2)**

- text “Um ambiente de estudo do seu jeito.” em (262,225) 491x20
- h2 “Uma atmosfera para se concentrar.” em (289,300) 1078x22
- h3 “Automático” em (289,373) 1078x17
- button “” em (289,402) 260x122
- text “Sistema” em (302,471) 234x16
- text “Segue o tema do sistema.” em (302,490) 234x16
- h3 “Claros” em (289,546) 1078x17
- button “” em (289,574) 260x122
- text “Claro, calmo e legível.” em (302,663) 234x16
- button “” em (562,574) 260x122
- text “Sépia” em (575,643) 234x16
- text “Mais quente para leitura longa.” em (575,663) 234x16
- button “” em (834,574) 260x122
- text “Oceano” em (847,643) 234x16
- text “Azul sereno para foco prolongado.” em (847,663) 234x16
- button “” em (1106,574) 260x122
- text “Floresta” em (1119,643) 234x16
- text “Verde suave, natural e equilibrado.” em (1119,663) 234x16
- button “” em (289,708) 260x122
- text “Catppuccin Latte” em (302,777) 234x16
- text “Claro, macio e azulado.” em (302,797) 234x16
- button “” em (562,708) 260x122
- text “Gruvbox Light” em (575,777) 234x16
- text “Claro, terroso e acolhedor.” em (575,797) 234x16
- button “” em (834,708) 260x122
- text “Solarized Light” em (847,777) 234x16
- text “Claro, equilibrado e confortável.” em (847,797) 234x16
- button “” em (1106,708) 260x122
- text “Dracula Light” em (1119,777) 234x16
- text “Claro com violeta e rosa.” em (1119,797) 234x16
- button “” em (289,842) 260x122
- text “Tokyo Day” em (302,911) 234x16
- text “Claro, frio e luminoso.” em (302,931) 234x16
- h3 “Escuros” em (289,986) 1078x17
- button “” em (289,1015) 260x122
- text “Noite” em (302,1084) 234x16
- text “Escuro, estável e discreto.” em (302,1104) 234x16
- button “” em (562,1015) 260x122
- text “Alto contraste” em (575,1084) 234x16
- text “Mais nítido para leitura rápida.” em (575,1104) 234x16
- button “” em (834,1015) 260x122
- text “Crepúsculo” em (847,1084) 234x16
- button “” em (1106,1015) 260x122
- text “Dracula” em (1119,1084) 234x16
- text “Violeta escuro com acentos rosados.” em (1119,1104) 234x16
- button “” em (289,1149) 260x122
- text “Catppuccin” em (302,1218) 234x16
- text “Escuro suave e aconchegante.” em (302,1238) 234x16
- button “” em (562,1149) 260x122
- text “One Dark” em (575,1218) 234x16
- text “Escuro técnico com azul sereno.” em (575,1238) 234x16
- button “” em (834,1149) 260x122
- text “Gruvbox” em (847,1218) 234x16
- text “Terroso, quente e confortável.” em (847,1238) 234x16
- button “” em (1106,1149) 260x122
- text “Neon” em (1119,1218) 234x16
- text “Preto intenso com cyan e magenta.” em (1119,1238) 234x16
- button “” em (289,1283) 260x122
- text “Premium” em (302,1352) 234x16
- text “Azul profundo com destaque cyan.” em (302,1372) 234x16
- … e mais 24

**Só no app (não existem na V7.2)**

- h2 “Tema” em (289,261)
- h2 “Idioma do conteúdo gerado” em (289,488)
- label “Gerar conteúdo em” em (289,621)
- button “Salvar idioma” em (289,700)
- h2 “Recurso em teste” em (289,845)
- label “” em (289,898)
- input “on” em (293,898)
- h2 “Sobre o SmartLearn” em (289,1054)
- button “Copiar diagnóstico” em (289,1274)
- h2 “Backup” em (289,1419)
- h2 “Restaurar ou migrar backup” em (289,1685)
- button “Selecionar arquivo de backup” em (289,1825)

**Existem nos dois, mas diferem**

- text “Papel”: posição ref(302,643) app(302,352); tamanho ref 234x16 app 31x20; corpo ref 12px app 13px
- button “Exportar backup”: posição ref(289,2025) app(289,1539); fundo ref rgb(255, 255, 255) app rgb(100, 55, 227); cor do texto ref rgb(32, 38, 64) app rgb(255, 255, 255); sombra ref não app shadow

## account

| Tipo | V7.2 | App |
|---|---:|---:|
| button | 2 | 4 |
| h1 | 1 | 1 |
| h2 | 1 | 0 |
| input | 0 | 2 |
| label | 0 | 2 |
| summary | 0 | 1 |
| svg | 0 | 2 |
| text | 6 | 3 |
| **Total** | **10** | **15** |

Rótulos fixos casados: 1. Faltam no app: 5. Só existem no app: 9. Casados com diferença visual: 0.

**Faltam no app (existem na V7.2)**

- text “SEU ESPAÇO” em (262,144) 1132x16
- h2 “Estudante” em (666,301) 147x22
- text “Ambiente de demonstração” em (666,326) 147x19
- button “Preferências e dados” em (605,444) 148x40
- button “Continuar estudo” em (762,444) 130x40

**Só no app (não existem na V7.2)**

- summary “Alterar senha” em (289,284)
- label “Senha atual” em (289,339)
- input “” em (289,364)
- input “” em (289,447)
- button “Mostrar senha” em (859,363)
- button “Mostrar senha” em (859,446)
- label “Nova senha” em (289,422)
- button “Alterar senha” em (289,536)
- button “Sair” em (289,369)

