# server (coffee-order backend)

이 폴더는 커피 주문 앱의 **백엔드 API 서버**를 위한 Express.js 프로젝트입니다.

## 실행 방법

```bash
cd server
npm install        # 의존성 설치 (최초 1회)
cp .env.example .env  # 환경변수 파일 생성 (Windows는 수동 복사)
npm run dev        # 개발 서버 실행 (기본 포트: 4000)
```

## 환경 변수

- `PORT` : 서버 포트
- `CORS_ORIGIN` : 허용할 프런트엔드 주소(복수 허용, 쉼표 구분)  
  예: `http://127.0.0.1:5173,http://localhost:5173`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` : PostgreSQL 연결 정보

서버가 실행되면 다음 엔드포인트를 사용할 수 있습니다.

- `GET /api/health` : 서버 상태 확인
- `GET /api/health/db` : PostgreSQL 연결 상태 확인
- `GET /api/menus` : (임시) 하드코딩된 커피 메뉴 목록 반환  
  → 이후 PostgreSQL 연동 후 실제 DB 조회 로직으로 교체할 예정입니다.

## DB 연결 확인 체크리스트

1. PostgreSQL 서버 실행
2. `.env` 의 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` 값 확인
3. `DB_NAME` 에 지정한 데이터베이스가 실제로 존재하는지 확인  
   (현재 기본값: `coffee_order`)
4. 서버 실행 후 `GET /api/health/db` 호출해서 연결 확인

## SQL 실행

```bash
cd server
npm run db:create   # DB 생성(없을 때만)
npm run db:migrate  # 테이블/인덱스 생성
npm run db:seed     # 기본 메뉴/옵션 데이터 입력
```

- 스키마 파일: `sql/001_schema.sql`
- 시드 파일: `sql/002_seed.sql`

## 기술 스택

- Node.js
- Express.js
- CORS

## 다음 단계

- `docs/PRD.md` 6장(백엔드 PRD)에 정의된 데이터 모델/플로우/API를 기준으로
  - PostgreSQL 스키마 생성
  - 메뉴/주문/재고 API 구현
  - 프런트엔드(`ui`)와 실제 API 연동

