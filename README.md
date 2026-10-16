# DAC: Diseño y Adaptación Curricular — Máster en Profesorado

Plataforma web interactiva para la asignatura de **Diseño y Adaptación Curricular (DAC)** del **Máster en Formación del Profesorado**. Permite previsualizar de forma integrada todos los documentos y presentaciones del curso, entrenar con un generador inteligente de exámenes tipo test con corrección en tiempo real y consultar un banco de 320 preguntas clasificadas y justificadas teóricamente.

---

## 🚀 Características Principales

### 1. 📂 Visor Integrado de Contenidos
- **Acceso por Temas (1, 2, 3 y 4)**: Consulta inmediata de diapositivas teóricas (`.pptx.pdf`) y esquemas visuales de resumen (`Figma.pdf`).
- **Visor Embebido**: Previsualización instantánea de los PDFs sin necesidad de abrir nuevas pestañas ni abandonar la aplicación.
- **Modo Pantalla Completa Responsivo**: Botón dedicado que expande el documento al 100% de la ventana sin descuadres ni desbordamientos horizontales o verticales.
- **Acceso Directo**: Opción para abrir el archivo en el visor nativo del navegador o descargarlo.

### 2. 📝 Generador de Exámenes Tipo Test
- **Banco Extenso**: **80 preguntas por tema** (un total de **320 preguntas** rigurosamente redactadas con 4 opciones verosímiles).
- **Selector Flexible de Preguntas**:
  - Control paso a paso de **5 en 5** (`[-]` y `[+]`).
  - Píldoras de acceso rápido (`5`, `10`, `15`, `20`, `25`, `30`, `40` preguntas).
- **Modos de Examen**:
  - **Por Tema Específico**: Focaliza el entrenamiento en el Tema 1, 2, 3 o 4.
  - **Todos los Temas Combinados**: Permite mezclar el temario completo con opción de **excluir** aquellos temas que no se deseen incluir.
- **Doble Aleatorización**:
  1. Barajado aleatorio del banco de preguntas seleccionadas.
  2. Permutación aleatoria de las 4 opciones de respuesta (A, B, C, D) en cada intento, evitando la memorización por posición de la respuesta correcta.
- **Corrección Instantánea y Didáctica**:
  - Evaluación al momento tras pulsar una respuesta (resaltado verde/rojo).
  - **Justificación legal y pedagógica** inmediata para cada pregunta (LOMLOE, Reales Decretos 217/2022 y 243/2022, DUA, documentos de centro, etc.).
  - Contadores dinámicos de progreso: *"Llevas X respondidas | Te quedan Y"*, porcentaje completado y nota provisional en tiempo real.
- **Informe de Resultados y Revisión**:
  - Calificación sobre 10 con baremo cualitativo (*Sobresaliente, Notable, Aprobado, Suspenso*).
  - Tasa de acierto, tiempo empleado y desglose de aciertos por tema.
  - Lista completa de revisión para repasar todas las preguntas, con filtros para ver solo aciertos o solo fallos.

### 3. 📚 Banco de Estudio Directo
- Repertorio completo de las **320 preguntas** disponibles para lectura y repaso sin necesidad de iniciar un test.
- **Buscador en tiempo real**: Filtra instantáneamente por términos, conceptos o normativas (*LOMLOE, PEC, DUA, Consejo Escolar, Decreto 252, etc.*).
- **Filtros de Píldoras por Tema**: Botones interactivos con contadores dinámicos de preguntas encontradas.

### 4. 🎨 Diseño Moderno, Accesible y 100% Responsive
- **Componentes 100% Maquetables en CSS**: Eliminación total de elementos `<select>` nativos del navegador, sustituidos por selectores, steppers y píldoras personalizadas con animaciones fluidas.
- **Iconografía SVG Vectorial**: Sustitución de emojis por iconos limpios, minimalistas, bicolores y monocolores coordinados con la paleta de colores.
- **Modo Oscuro / Modo Claro**: Alternador en la barra superior con persistencia de preferencia en `localStorage`.
- **Adaptabilidad Total**: Optimizado para teléfonos móviles, tablets y monitores de alta resolución con navegación táctil horizontal suave.

---

## 🌐 Despliegue en GitHub Pages (Paso a Paso)

El repositorio está 100% optimizado para publicarse en **GitHub Pages** de forma inmediata:

1. **Sube el repositorio a GitHub**:
   ```bash
   git add .
   git commit -m "Deploy DAC platform - Máster en Profesorado"
   git push origin main
   ```
2. **Activa GitHub Pages**:
   - En tu repositorio de GitHub, entra en **Settings** (Configuración) > **Pages** (en el menú lateral izquierdo).
   - En **Build and deployment** > **Source**, selecciona **Deploy from a branch**.
   - En **Branch**, selecciona la rama `main` (o `master`) y la carpeta `/ (root)`.
   - Haz clic en **Save** (Guardar).
3. **¡Listo!** En unos 30-60 segundos tendrás tu enlace público funcionando (por ejemplo `https://tu-usuario.github.io/master-dac/`).

> [!NOTE]
> El repositorio incluye el archivo `.nojekyll` para que GitHub Pages sirva todos los archivos directamente sin pasar por el motor de Jekyll, evitando bloqueos de archivos y acelerando el tiempo de carga.

---

## 💻 Otras Formas de Uso Local

### Opción A: Doble Clic Directo (Sin Servidor ni Terminal)
1. Descarga o clona la carpeta.
2. Haz doble clic en `index.html`.
3. Funcionará de inmediato con todas sus funciones activas.

### Opción B: Servidor Local
```bash
python3 -m http.server 8080
# o también:
npx serve .
```

---

## 📂 Estructura del Repositorio

```text
master-dac/
├── .nojekyll                        # Desactiva Jekyll en GitHub Pages para servir archivos directos
├── 404.html                         # Página de error 404 personalizada con redirección a index.html
├── assets/                          # Documentación y materiales de estudio originales
│   ├── tema 1/                      # PPTX.pdf y Figma.pdf del Tema 1
│   ├── tema 2/                      # PPTX.pdf y Figma.pdf del Tema 2
│   ├── tema 3/                      # PPTX.pdf y Figma.pdf del Tema 3
│   └── tema 4/                      # PPTX.pdf y Figma.pdf del Tema 4
├── css/
│   └── style.css                    # Estilos CSS modernos, tokens, glassmorphism y media queries
├── data/
│   └── questions-data.js            # Banco oficial de 320 preguntas (carga instantánea sin latencia)
├── js/
│   ├── app.js                       # Lógica de navegación, visor de documentos y banco de estudio
│   └── quiz.js                      # Motor del examen: barajado, temporizador, corrección y estadísticas
├── index.html                       # Página principal con Open Graph meta tags y rutas relativas
└── README.md                        # Documentación completa del proyecto
```

---

## 📖 Temario Incluido

| Tema | Título | Foco Normativo y Pedagógico | Preguntas |
| :---: | :--- | :--- | :---: |
| **Tema 1** | **Evolución del Sistema Educativo Español** | Leyes históricas (LGE 1970, Constitución 1978, LODE, LOGSE, LOPEGCE, LOCE, LOE, LOMCE, LOMLOE) y Ley de FP 2022. Estructura de etapas y comparativa competencial. | **80** |
| **Tema 2** | **La Estructura General del Diseño Curricular** | Concepto y dimensiones del currículo (abierto, flexible, prescriptivo), fuentes del currículo, Perfil de Salida, Competencias Clave y Específicas, Criterios de Evaluación y Saberes Básicos. | **80** |
| **Tema 3** | **Concreción Curricular y Niveles de Concreción** | 1º nivel (Administración), 2º nivel (Centro / PEC / Concreción), 3º nivel (Aula / Situaciones de Aprendizaje / Programación) y 4º nivel (Adaptaciones Curriculares Individualizadas y DUA). | **80** |
| **Tema 4** | **Documentos Institucionales de Centro** | Proyecto Educativo de Centro (PEC), Programación General Anual (PGA), Reglamento de Régimen Interior (RRI / NOFC), Plan de Atención a la Diversidad (PAD / PAM), Memoria Anual y Órganos Colegiados (Claustro y Consejo Escolar). | **80** |
| **Total** | | | **320** |

---

## 📄 Licencia y Uso
Proyecto desarrollado con fines académicos y de preparación para la docencia en Educación Secundaria, Bachillerato y Formación Profesional.
