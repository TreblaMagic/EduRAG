# EduRAG Causal AI — Development Rules

## 1. Project Standard

This project must be built as a professional, production-style prototype that can be reviewed by companies, recruiters, engineers, and technical interviewers.

Do not build quick, messy demo code. Every feature must be structured, readable, documented, and scalable.

## 2. Core Product Goal

Build an educational analytics prototype that uses LMS-style student activity data to:

- ingest student learning activity records
- calculate engagement and Resource Diversity Index scores
- model causal relationships between learning behavior and academic outcome
- simulate “what-if” interventions
- present results in a clean dashboard for advisors/students

The project must communicate clearly that this is not just grade prediction, but explainable causal insight.

## 3. Tech Stack

Use this default stack unless explicitly changed:

- Frontend: Next.js + TypeScript
- Styling: Tailwind CSS
- Backend/API: Next.js API routes or FastAPI if Python processing requires it
- Database: SQLite for MVP
- ORM: Prisma if using Next.js backend
- Data Processing: Python where needed
- Visualization: Recharts / D3 / NetworkX graph exports
- Testing: Vitest / Playwright where relevant

## 4. Architecture Rules

Use a clean modular structure.

Suggested structure:

```txt
/src
  /app
  /components
  /features
    /students
    /courses
    /analytics
    /causal-engine
    /interventions
  /lib
  /server
  /types
  /utils

/data
  /raw
  /processed

/docs
  architecture.md
  data-model.md
  causal-methodology.md

/prisma
  schema.prisma
```
Do not place business logic directly inside UI components.

UI components should display data only. Data processing, causal calculations, and database logic must live in separate service/helper layers.

## 5. Code Quality Rules

All code must be:

- written in TypeScript where possible
- strongly typed
- readable and self-documenting
- split into small reusable functions
- free from unused files, dead code, and console spam
- formatted consistently
- named clearly

Avoid vague names like:

```txt
data1
thing
stuff
testFunction
finalLogic
```

Use descriptive names like:

```txt
calculateResourceDiversityIndex
generateStudentRiskProfile
simulateLearningIntervention
getCourseEngagementSummary
```

## 6. Database Rules

Use SQLite for the prototype.

Store structured data in the database:

- students
- courses
- resources
- LMS activity logs
- grades
- RDI scores
- causal model outputs
- intervention simulations

Store uploaded CSV files or exported reports in the file system.

The database should be easy to migrate later to PostgreSQL.

Do not design the database in a way that only works for SQLite.

## 7. Data Rules

Use realistic demo data, but do not use real student private data.

All student data must be synthetic or anonymized.

Every dataset should have clear fields, for example:

```txt
student_id
course_id
resource_type
activity_type
timestamp
duration_seconds
quiz_score
forum_posts
prior_gpa
final_grade
```

## 8. Causal Engine Rules

The causal engine must be separated from the UI.

It should handle:

- preprocessing
- RDI calculation
- correlation checks
- causal graph generation
- intervention simulation
- counterfactual-style explanations

Do not falsely claim scientific certainty.

Use language like:

```txt
Estimated effect
Simulated outcome
Likely causal driver
Model-based recommendation
```

Avoid language like:

```txt
Guaranteed result
Proven cause
This will definitely improve the grade
```

## 9. UI/UX Rules

The dashboard should feel clean, modern, and portfolio-ready.

Required screens:

- Overview dashboard
- Student profile
- Course analytics
- Causal graph view
- What-if simulator
- Intervention recommendations
- Dataset upload/import page

Each screen must be understandable to non-technical users.

Use cards, charts, simple tables, and clear explanations.

## 10. Documentation Rules

Every major feature must include documentation.

Required docs:

```txt
README.md
docs/architecture.md
docs/data-model.md
docs/causal-methodology.md
docs/demo-script.md
```

The README must explain:

- what the project does
- why it matters
- tech stack
- how to run locally
- demo credentials/data
- screenshots
- limitations
- future improvements

## 11. Git / Review Rules

The project must be clean enough for company review.

Every major phase should be committed separately:

```txt
phase-1-project-setup
phase-2-database-schema
phase-3-demo-data-ingestion
phase-4-rdi-engine
phase-5-causal-simulation
phase-6-dashboard-ui
phase-7-polish-and-docs
```

Do not commit:

```txt
node_modules
.env
large raw files
private data
temporary test files
```

## 12. Security Rules

Never expose secrets in the repo.

Use:

```txt
.env.example
```

instead of committing real environment variables.

Validate all uploaded files.

Do not trust CSV input blindly.

## 13. Testing Rules

At minimum, test:

- RDI calculation
- data import
- student score aggregation
- intervention simulation logic
- key UI rendering

Logic-heavy code must have tests.

## 14. Portfolio Rules

The final project should be presentable as:

- a GitHub repository
- a LinkedIn post
- a CV project
- a demo walkthrough
- a technical case study

Prioritize clarity over unnecessary complexity.

## 15. Claude Behavior Rules

When building this project, Claude must:

- explain architectural decisions before implementing large changes
- avoid rewriting unrelated files
- keep changes small and phase-based
- follow the current phase plan
- update documentation as code changes
- never introduce unnecessary libraries
- ask only when a decision blocks progress
- prefer scalable structure over quick hacks

Every implementation should be done as if a senior engineer will review the repository.