// checklists.js - modelos fixos da v54
// Base v53/v52/v42; ajustes de alinhamento e tipografia sem alterar dados salvos.
window.MULTIOS_CHECKLISTS = {
  "fm408-climatica": {
    "codigo": "FM-408",
    "nome": "Câmara Climática / Sala Climatizada",
    "pdf": "./checklists/FM-408-climatica.pdf",
    "paginas": 2,
    "colunas": {
      "verificadoX": 251.9,
      "substituidoX": 306.3,
      "obsX": 346,
      "obsWidth": 214,
      "statusFontSize": 10,
      "obsFontSize": 10,
      "obsMinFontSize": 6
    },
    "campos": [
      {
        "source": "modeloOuEquipamento",
        "page": 0,
        "x": 130,
        "top": 199,
        "width": 52,
        "fontSize": 10
      },
      {
        "source": "serie",
        "page": 0,
        "x": 219,
        "top": 199,
        "width": 53,
        "fontSize": 10
      },
      {
        "source": "osNum",
        "page": 0,
        "x": 313,
        "top": 199,
        "width": 54,
        "fontSize": 10
      },
      {
        "source": "cliente",
        "page": 0,
        "x": 412,
        "top": 199,
        "width": 145,
        "fontSize": 10
      },
      {
        "source": "nomeClienteFinal",
        "page": 1,
        "x": 116,
        "top": 290.2,
        "width": 275,
        "fontSize": 10
      },
      {
        "source": "cargo",
        "page": 1,
        "x": 442,
        "top": 290.2,
        "width": 105,
        "fontSize": 10
      },
      {
        "source": "dataChecklist",
        "page": 1,
        "x": 62,
        "top": 311.7,
        "width": 165,
        "fontSize": 10
      },
      {
        "source": "tecnico",
        "page": 1,
        "x": 350,
        "top": 310.4,
        "width": 138,
        "fontSize": 10
      }
    ],
    "grupos": [
      {
        "titulo": "Sistema de Umidificação",
        "itens": [
          {
            "key": "i1",
            "label": "Limpeza",
            "page": 0,
            "top": 231.8
          },
          {
            "key": "i2",
            "label": "Teste boia de nível",
            "page": 0,
            "top": 246.4
          },
          {
            "key": "i3",
            "label": "Teste sistema de proteção da resistência",
            "page": 0,
            "top": 261.1
          },
          {
            "key": "i4",
            "label": "Verificação das mangueiras",
            "page": 0,
            "top": 275.9
          },
          {
            "key": "i5",
            "label": "Válvula de entrada d'água",
            "page": 0,
            "top": 290.5
          },
          {
            "key": "i6",
            "label": "Bico aspersor",
            "page": 0,
            "top": 305.1
          },
          {
            "key": "i7",
            "label": "Tubulação / mangueiras",
            "page": 0,
            "top": 319.6
          }
        ]
      },
      {
        "titulo": "Osmose Reversa",
        "itens": [
          {
            "key": "i8",
            "label": "Verificação dos filtros",
            "page": 0,
            "top": 349.0
          },
          {
            "key": "i9",
            "label": "Verificação do funcionamento",
            "page": 0,
            "top": 363.7
          },
          {
            "key": "i10",
            "label": "Vazamentos",
            "page": 0,
            "top": 378.3
          },
          {
            "key": "i11",
            "label": "Verificação da vazão",
            "page": 0,
            "top": 392.9
          }
        ]
      },
      {
        "titulo": "Sistema de Circulação de Ar",
        "itens": [
          {
            "key": "i12",
            "label": "Funcionamento",
            "page": 0,
            "top": 422.2
          },
          {
            "key": "i13",
            "label": "Limpeza",
            "page": 0,
            "top": 436.8
          },
          {
            "key": "i14",
            "label": "Lubrificação",
            "page": 0,
            "top": 451.6
          },
          {
            "key": "i15",
            "label": "Integridade",
            "page": 0,
            "top": 466.2
          }
        ]
      },
      {
        "titulo": "Sistema de Refrigeração",
        "itens": [
          {
            "key": "i16",
            "label": "Limpeza condensador",
            "page": 0,
            "top": 495.5
          },
          {
            "key": "i17",
            "label": "Microventilador",
            "page": 0,
            "top": 510.3
          },
          {
            "key": "i18",
            "label": "Pressão do gás",
            "page": 0,
            "top": 524.8
          },
          {
            "key": "i19",
            "label": "Corrente compressor",
            "page": 0,
            "top": 539.4
          },
          {
            "key": "i20",
            "label": "Eficiência",
            "page": 0,
            "top": 554.2
          }
        ]
      },
      {
        "titulo": "Painel de Controle",
        "itens": [
          {
            "key": "i21",
            "label": "Funcionamento",
            "page": 0,
            "top": 583.3
          },
          {
            "key": "i22",
            "label": "Configuração",
            "page": 0,
            "top": 598.1
          },
          {
            "key": "i23",
            "label": "Sensibilidade e funcionamento teclas",
            "page": 0,
            "top": 612.7
          },
          {
            "key": "i24",
            "label": "Terminais",
            "page": 0,
            "top": 627.3
          }
        ]
      },
      {
        "titulo": "Sensores",
        "itens": [
          {
            "key": "i25",
            "label": "Integridade",
            "page": 0,
            "top": 656.8
          },
          {
            "key": "i26",
            "label": "Terminais",
            "page": 0,
            "top": 671.4
          },
          {
            "key": "i27",
            "label": "Desvios",
            "page": 0,
            "top": 685.9
          }
        ]
      },
      {
        "titulo": "Vedações",
        "itens": [
          {
            "key": "i28",
            "label": "Integridade",
            "page": 0,
            "top": 715.3
          },
          {
            "key": "i29",
            "label": "Regulagem da porta",
            "page": 0,
            "top": 729.9
          },
          {
            "key": "i30",
            "label": "Dobradiças",
            "page": 0,
            "top": 744.6
          },
          {
            "key": "i31",
            "label": "Maçanetas",
            "page": 0,
            "top": 759.2
          }
        ]
      },
      {
        "titulo": "Limpeza",
        "itens": [
          {
            "key": "i32",
            "label": "Parte interna",
            "page": 0,
            "top": 788.5
          },
          {
            "key": "i33",
            "label": "Parte externa",
            "page": 1,
            "top": 134.1
          },
          {
            "key": "i34",
            "label": "Dreno",
            "page": 1,
            "top": 148.6
          },
          {
            "key": "i35",
            "label": "Vidros",
            "page": 1,
            "top": 163.2
          }
        ]
      },
      {
        "titulo": "Parte Elétrica",
        "itens": [
          {
            "key": "i36",
            "label": "Resistências",
            "page": 1,
            "top": 192.6
          },
          {
            "key": "i37",
            "label": "Disjuntores",
            "page": 1,
            "top": 207.1
          },
          {
            "key": "i38",
            "label": "Corrente motor",
            "page": 1,
            "top": 221.9
          },
          {
            "key": "i39",
            "label": "Contatoras",
            "page": 1,
            "top": 236.7
          },
          {
            "key": "i40",
            "label": "Integridade dos fios",
            "page": 1,
            "top": 251.2
          },
          {
            "key": "i41",
            "label": "Conexões",
            "page": 1,
            "top": 265.8
          },
          {
            "key": "i42",
            "label": "Componentes",
            "page": 1,
            "top": 280.6
          }
        ]
      }
    ]
  },
  "fm409-durometros": {
    "codigo": "FM-409",
    "nome": "Durômetros",
    "pdf": "./checklists/FM-409-durometros.pdf",
    "paginas": 1,
    "colunas": {
      "verificadoX": 293,
      "substituidoX": 343.7,
      "obsX": 376,
      "obsWidth": 186,
      "statusFontSize": 10,
      "obsFontSize": 10,
      "obsMinFontSize": 6
    },
    "campos": [
      {
        "source": "modeloOuEquipamento",
        "page": 0,
        "x": 145,
        "top": 143.2,
        "width": 48,
        "fontSize": 10
      },
      {
        "source": "serie",
        "page": 0,
        "x": 238,
        "top": 143.2,
        "width": 161,
        "fontSize": 10
      },
      {
        "source": "osNum",
        "page": 0,
        "x": 420,
        "top": 143.2,
        "width": 57,
        "fontSize": 10
      },
      {
        "source": "nomeClienteFinal",
        "page": 0,
        "x": 115,
        "top": 657.4,
        "width": 165,
        "fontSize": 10
      },
      {
        "source": "cargo",
        "page": 0,
        "x": 350,
        "top": 655,
        "width": 115,
        "fontSize": 10
      },
      {
        "source": "dataChecklist",
        "page": 0,
        "x": 74,
        "top": 680,
        "width": 115,
        "fontSize": 10
      },
      {
        "source": "tecnico",
        "page": 0,
        "x": 350,
        "top": 676.2,
        "width": 190,
        "fontSize": 10
      }
    ],
    "grupos": [
      {
        "titulo": "Painel de Controle",
        "itens": [
          {
            "key": "i1",
            "label": "Teste das funções",
            "page": 0,
            "top": 178.6
          },
          {
            "key": "i2",
            "label": "Testes de sensibilidade do visor e/ou teclas",
            "page": 0,
            "top": 193.1
          },
          {
            "key": "i3",
            "label": "Verificação dos parâmetros de configuração",
            "page": 0,
            "top": 207.8
          },
          {
            "key": "i4",
            "label": "Verificação da saída de controle e retransmissão",
            "page": 0,
            "top": 222.6
          }
        ]
      },
      {
        "titulo": "Parte Mecânica",
        "itens": [
          {
            "key": "i5",
            "label": "Sistema mecânico horizontal",
            "page": 0,
            "top": 251.8
          },
          {
            "key": "i6",
            "label": "Sistema mecânico vertical",
            "page": 0,
            "top": 266.3
          },
          {
            "key": "i7",
            "label": "Rolamentos",
            "page": 0,
            "top": 281.1
          },
          {
            "key": "i8",
            "label": "Polias",
            "page": 0,
            "top": 295.8
          },
          {
            "key": "i9",
            "label": "Correias",
            "page": 0,
            "top": 310.4
          }
        ]
      },
      {
        "titulo": "Parte Elétrica",
        "itens": [
          {
            "key": "i10",
            "label": "Motor de passo",
            "page": 0,
            "top": 339.7
          },
          {
            "key": "i11",
            "label": "Saídas placa fonte",
            "page": 0,
            "top": 354.3
          },
          {
            "key": "i12",
            "label": "Saídas transformador",
            "page": 0,
            "top": 369.1
          },
          {
            "key": "i13",
            "label": "Célula de carga",
            "page": 0,
            "top": 383.8
          },
          {
            "key": "i14",
            "label": "Cabos de comunicação",
            "page": 0,
            "top": 398.3
          },
          {
            "key": "i15",
            "label": "Fiação",
            "page": 0,
            "top": 412.8
          },
          {
            "key": "i16",
            "label": "Conectores",
            "page": 0,
            "top": 427.6
          }
        ]
      },
      {
        "titulo": "Limpeza",
        "itens": [
          {
            "key": "i17",
            "label": "Limpeza parte interna",
            "page": 0,
            "top": 456.9
          },
          {
            "key": "i18",
            "label": "Limpeza parte externa",
            "page": 0,
            "top": 471.5
          }
        ]
      },
      {
        "titulo": "Funcionamento",
        "itens": [
          {
            "key": "i19",
            "label": "Realizou auto zero corretamente?",
            "page": 0,
            "top": 500.8
          },
          {
            "key": "i20",
            "label": "Leituras estão de acordo?",
            "page": 0,
            "top": 515.6
          },
          {
            "key": "i21",
            "label": "Parâmetros de fábrica?",
            "page": 0,
            "top": 530.3
          },
          {
            "key": "i22",
            "label": "Valor AD está de acordo?",
            "page": 0,
            "top": 544.8
          },
          {
            "key": "i23",
            "label": "Ruídos anormais?",
            "page": 0,
            "top": 559.3
          },
          {
            "key": "i28",
            "label": "Célula de carga",
            "page": 0,
            "top": 573.9
          }
        ]
      },
      {
        "titulo": "Limpeza Final",
        "itens": [
          {
            "key": "i24",
            "label": "Parte interna",
            "page": 0,
            "top": 603.4
          },
          {
            "key": "i25",
            "label": "Parte externa",
            "page": 0,
            "top": 617.9
          },
          {
            "key": "i26",
            "label": "Dreno",
            "page": 0,
            "top": 632.6
          },
          {
            "key": "i27",
            "label": "Vidros",
            "page": 0,
            "top": 647.4
          }
        ]
      }
    ]
  },
  "fm410-incubadora": {
    "codigo": "FM-410",
    "nome": "Incubadora / Câmara Fria / Estufa",
    "pdf": "./checklists/FM-410-incubadora-estufa.pdf",
    "paginas": 1,
    "colunas": {
      "verificadoX": 343.25,
      "substituidoX": 407.05,
      "obsX": 444.0,
      "obsWidth": 112.0,
      "statusFontSize": 10,
      "obsFontSize": 10,
      "obsMinFontSize": 6
    },
    "campos": [
      {
        "source": "modeloOuEquipamento",
        "page": 0,
        "x": 177,
        "top": 181.2,
        "width": 52,
        "fontSize": 10
      },
      {
        "source": "serie",
        "page": 0,
        "x": 263,
        "top": 181.2,
        "width": 98,
        "fontSize": 10
      },
      {
        "source": "tag",
        "page": 0,
        "x": 391,
        "top": 181.2,
        "width": 73,
        "fontSize": 10
      },
      {
        "source": "osNum",
        "page": 0,
        "x": 500,
        "top": 181.2,
        "width": 55,
        "fontSize": 10
      },
      {
        "source": "nomeClienteFinal",
        "page": 0,
        "x": 111,
        "top": 680.2,
        "width": 125,
        "fontSize": 10
      },
      {
        "source": "cargo",
        "page": 0,
        "x": 273,
        "top": 679.3,
        "width": 85,
        "fontSize": 10
      },
      {
        "source": "dataChecklist",
        "page": 0,
        "x": 59,
        "top": 718.7,
        "width": 125,
        "fontSize": 10
      },
      {
        "source": "tecnico",
        "page": 0,
        "x": 279,
        "top": 718.0,
        "width": 155,
        "fontSize": 10
      }
    ],
    "grupos": [
      {
        "titulo": "Sistema de Circulação de Ar",
        "itens": [
          {"key":"i1","label":"Funcionamento","page":0,"top":226.5},
          {"key":"i2","label":"Limpeza","page":0,"top":241.2},
          {"key":"i3","label":"Lubrificação","page":0,"top":255.8}
        ]
      },
      {
        "titulo": "Sistema de Refrigeração",
        "itens": [
          {"key":"i4","label":"Limpeza do condensador","page":0,"top":285.1},
          {"key":"i5","label":"Micromotor c/ hélice","page":0,"top":299.8},
          {"key":"i6","label":"Corrente compressor","page":0,"top":314.4},
          {"key":"i7","label":"Eficiência","page":0,"top":329.1}
        ]
      },
      {
        "titulo": "Painel de Controle",
        "itens": [
          {"key":"i8","label":"Testes das funções","page":0,"top":358.4},
          {"key":"i9","label":"Testes de sensibilidade do visor ou teclas","page":0,"top":373.0},
          {"key":"i10","label":"Verificação dos parâmetros de configuração","page":0,"top":387.7},
          {"key":"i11","label":"Verificação da saída de controle e retransmissão","page":0,"top":402.3}
        ]
      },
      {
        "titulo": "Sensores",
        "itens": [
          {"key":"i12","label":"Verificação da integridade","page":0,"top":431.6},
          {"key":"i13","label":"Substituição dos terminais","page":0,"top":446.3},
          {"key":"i14","label":"Comparação com sensor calibrado","page":0,"top":460.9}
        ]
      },
      {
        "titulo": "Vedações",
        "itens": [
          {"key":"i15","label":"Integridade","page":0,"top":490.2},
          {"key":"i16","label":"Regulagem da porta","page":0,"top":504.9},
          {"key":"i17","label":"Dobradiças","page":0,"top":519.5},
          {"key":"i18","label":"Maçanetas","page":0,"top":534.2}
        ]
      },
      {
        "titulo": "Limpeza",
        "itens": [
          {"key":"i19","label":"Parte interna","page":0,"top":563.5},
          {"key":"i20","label":"Parte externa","page":0,"top":578.1},
          {"key":"i21","label":"Dreno","page":0,"top":592.8},
          {"key":"i22","label":"Vidros","page":0,"top":607.4}
        ]
      },
      {
        "titulo": "Parte Elétrica",
        "itens": [
          {"key":"i23","label":"Integridade dos fios","page":0,"top":636.7},
          {"key":"i24","label":"Conexões","page":0,"top":651.4},
          {"key":"i25","label":"Componentes","page":0,"top":666.0}
        ]
      }
    ]
  },
  "fm411-banho": {
    "codigo": "FM-411",
    "nome": "Banho Maria",
    "pdf": "./checklists/FM-411-banho-maria.pdf",
    "paginas": 1,
    "colunas": {
      "verificadoX": 315.4,
      "substituidoX": 366.3,
      "obsX": 399,
      "obsWidth": 182,
      "statusFontSize": 10,
      "obsFontSize": 10,
      "obsMinFontSize": 6
    },
    "campos": [
      {
        "source": "modeloOuEquipamento",
        "page": 0,
        "x": 166,
        "top": 143.2,
        "width": 53,
        "fontSize": 10
      },
      {
        "source": "serie",
        "page": 0,
        "x": 247,
        "top": 143.2,
        "width": 165,
        "fontSize": 10
      },
      {
        "source": "osNum",
        "page": 0,
        "x": 442,
        "top": 143.2,
        "width": 60,
        "fontSize": 10
      },
      {
        "source": "nomeClienteFinal",
        "page": 0,
        "x": 118,
        "top": 488.9,
        "width": 165,
        "fontSize": 10
      },
      {
        "source": "cargo",
        "page": 0,
        "x": 350,
        "top": 491.2,
        "width": 115,
        "fontSize": 10
      },
      {
        "source": "dataChecklist",
        "page": 0,
        "x": 74,
        "top": 511.2,
        "width": 115,
        "fontSize": 10
      },
      {
        "source": "tecnico",
        "page": 0,
        "x": 350,
        "top": 513.6,
        "width": 190,
        "fontSize": 10
      }
    ],
    "grupos": [
      {
        "titulo": "Sistema de Circulação d'Água",
        "itens": [
          {
            "key": "i1",
            "label": "Verificação do motor",
            "page": 0,
            "top": 187.8
          },
          {
            "key": "i2",
            "label": "Verificação da resistência",
            "page": 0,
            "top": 204.1
          },
          {
            "key": "i3",
            "label": "Verificação de vibração",
            "page": 0,
            "top": 218.7
          }
        ]
      },
      {
        "titulo": "Painel de Controle",
        "itens": [
          {
            "key": "i4",
            "label": "Teste das funções",
            "page": 0,
            "top": 248
          },
          {
            "key": "i5",
            "label": "Testes de sensibilidade do visor e/ou teclas",
            "page": 0,
            "top": 262.7
          },
          {
            "key": "i6",
            "label": "Verificação dos parâmetros de configuração",
            "page": 0,
            "top": 277.3
          },
          {
            "key": "i7",
            "label": "Verificação da saída de controle e retransmissão",
            "page": 0,
            "top": 292
          }
        ]
      },
      {
        "titulo": "Sensores",
        "itens": [
          {
            "key": "i8",
            "label": "Verificação da integridade",
            "page": 0,
            "top": 321.3
          },
          {
            "key": "i9",
            "label": "Substituição dos terminais",
            "page": 0,
            "top": 335.9
          },
          {
            "key": "i10",
            "label": "Comparação com sensor calibrado",
            "page": 0,
            "top": 350.6
          },
          {
            "key": "i11",
            "label": "Verificação da integridade",
            "page": 0,
            "top": 365.2
          }
        ]
      },
      {
        "titulo": "Limpeza",
        "itens": [
          {
            "key": "i12",
            "label": "Parte interna",
            "page": 0,
            "top": 394.5
          },
          {
            "key": "i13",
            "label": "Parte externa",
            "page": 0,
            "top": 409.2
          },
          {
            "key": "i14",
            "label": "Dreno",
            "page": 0,
            "top": 423.8
          }
        ]
      },
      {
        "titulo": "Parte Elétrica",
        "itens": [
          {
            "key": "i15",
            "label": "Integridade dos fios",
            "page": 0,
            "top": 453.1
          },
          {
            "key": "i16",
            "label": "Conectores",
            "page": 0,
            "top": 467.8
          },
          {
            "key": "i17",
            "label": "Componentes",
            "page": 0,
            "top": 482.4
          }
        ]
      }
    ]
  },
  "fm411-dissolutor": {
    "codigo": "FM-411",
    "nome": "Dissolutor / Desintegrador de Comprimidos",
    "pdf": "./checklists/FM-411-dissolutor-desintegrador.pdf",
    "paginas": 1,
    "colunas": {
      "verificadoX": 315.4,
      "substituidoX": 366.3,
      "obsX": 399,
      "obsWidth": 182,
      "statusFontSize": 10,
      "obsFontSize": 10,
      "obsMinFontSize": 6
    },
    "campos": [
      {
        "source": "modeloOuEquipamento",
        "page": 0,
        "x": 186,
        "top": 143.2,
        "width": 55,
        "fontSize": 10
      },
      {
        "source": "serie",
        "page": 0,
        "x": 278,
        "top": 143.2,
        "width": 165,
        "fontSize": 10
      },
      {
        "source": "osNum",
        "page": 0,
        "x": 464,
        "top": 143.2,
        "width": 58,
        "fontSize": 10
      },
      {
        "source": "nomeClienteFinal",
        "page": 0,
        "x": 118,
        "top": 645.1,
        "width": 165,
        "fontSize": 10
      },
      {
        "source": "cargo",
        "page": 0,
        "x": 350,
        "top": 647.5,
        "width": 115,
        "fontSize": 10
      },
      {
        "source": "dataChecklist",
        "page": 0,
        "x": 74,
        "top": 667.5,
        "width": 115,
        "fontSize": 10
      },
      {
        "source": "tecnico",
        "page": 0,
        "x": 350,
        "top": 669.9,
        "width": 190,
        "fontSize": 10
      }
    ],
    "grupos": [
      {
        "titulo": "Sistema de Bomba e Aquecimento d'Água",
        "itens": [
          {
            "key": "i1",
            "label": "Verificação do motor",
            "page": 0,
            "top": 172.7
          },
          {
            "key": "i2",
            "label": "Teste boia de segurança",
            "page": 0,
            "top": 187.3
          },
          {
            "key": "i3",
            "label": "Teste sistema de proteção da resistência",
            "page": 0,
            "top": 203.6
          },
          {
            "key": "i4",
            "label": "Verificação das mangueiras",
            "page": 0,
            "top": 213.8
          },
          {
            "key": "i5",
            "label": "Verificação de vibração",
            "page": 0,
            "top": 228.5
          },
          {
            "key": "i6",
            "label": "Mangueiras / conexões",
            "page": 0,
            "top": 243.1
          }
        ]
      },
      {
        "titulo": "Sistema de Movimentação das Hastes",
        "itens": [
          {
            "key": "i7",
            "label": "Verificação do motor",
            "page": 0,
            "top": 272.4
          },
          {
            "key": "i8",
            "label": "Tencionamento da correas",
            "page": 0,
            "top": 287.1
          },
          {
            "key": "i9",
            "label": "Verificação da parte mecânica (mancais, esticadores, reduções)",
            "page": 0,
            "top": 301.7
          },
          {
            "key": "i10",
            "label": "Verificação da oscilação das hastes",
            "page": 0,
            "top": 316.4
          },
          {
            "key": "i11",
            "label": "Lubrificação dos mancais",
            "page": 0,
            "top": 331
          },
          {
            "key": "i12",
            "label": "Verificação de ruídos anormais",
            "page": 0,
            "top": 345.7
          }
        ]
      },
      {
        "titulo": "Painel de Controle",
        "itens": [
          {
            "key": "i13",
            "label": "Teste das funções",
            "page": 0,
            "top": 375
          },
          {
            "key": "i14",
            "label": "Testes de sensibilidade do visor e/ou teclas",
            "page": 0,
            "top": 389.6
          },
          {
            "key": "i15",
            "label": "Verificação dos parâmetros de configuração",
            "page": 0,
            "top": 404.3
          },
          {
            "key": "i16",
            "label": "Verificação da saída de controle e retransmissão",
            "page": 0,
            "top": 418.9
          }
        ]
      },
      {
        "titulo": "Sensores",
        "itens": [
          {
            "key": "i17",
            "label": "Verificação da integridade",
            "page": 0,
            "top": 448.2
          },
          {
            "key": "i18",
            "label": "Substituição dos terminais",
            "page": 0,
            "top": 462.9
          },
          {
            "key": "i19",
            "label": "Comparação com sensor calibrado",
            "page": 0,
            "top": 477.5
          }
        ]
      },
      {
        "titulo": "Vidrarias / Cuba de Acrílico",
        "itens": [
          {
            "key": "i20",
            "label": "Verificação da integridade",
            "page": 0,
            "top": 506.8
          },
          {
            "key": "i21",
            "label": "Verificação do alinhamento e nivelamento",
            "page": 0,
            "top": 521.5
          }
        ]
      },
      {
        "titulo": "Limpeza",
        "itens": [
          {
            "key": "i22",
            "label": "Parte interna",
            "page": 0,
            "top": 550.8
          },
          {
            "key": "i23",
            "label": "Parte externa",
            "page": 0,
            "top": 565.4
          },
          {
            "key": "i24",
            "label": "Dreno",
            "page": 0,
            "top": 580.1
          }
        ]
      },
      {
        "titulo": "Parte Elétrica",
        "itens": [
          {
            "key": "i25",
            "label": "Integridade dos fios",
            "page": 0,
            "top": 609.4
          },
          {
            "key": "i26",
            "label": "Conectores",
            "page": 0,
            "top": 624
          },
          {
            "key": "i27",
            "label": "Componentes",
            "page": 0,
            "top": 638.7
          }
        ]
      }
    ]
  }
};
