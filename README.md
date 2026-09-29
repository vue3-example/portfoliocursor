# COZY 커피 주문 앱

사용자가 커피 메뉴를 주문하고, 관리자가 재고와 주문 상태를 관리할 수 있는 간단한 **풀스택 웹 앱**입니다.
프런트엔드와 백엔드를 분리해 개발한 학습용 프로젝트이며, 사용자 인증과 결제 기능은 포함하지 않습니다.

## 주요 기능

### 주문하기 화면
- 커피 메뉴를 카드 형태로 조회 (이미지, 이름, 가격, 설명)
- 옵션 선택: 샷 추가 (+500원), 시럽 추가 (+0원)
- 장바구니 담기 (같은 메뉴 + 같은 옵션이면 수량 증가, 옵션이 다르면 별도 항목)
- 총 금액 자동 계산 및 주문 요청
- 주문 실패 시 장바구니 유지, 중복 클릭 방지

### 관리자 화면
- 대시보드: 총 주문 / 주문 접수 / 제조 중 / 제조 완료 건수
- 재고 관리: 메뉴별 재고 `+` / `-` 조정 (0 미만 차단)
- 주문 현황: 최신순 목록, 상태를 `주문 접수 → 제조 중 → 제조 완료` 순서로만 변경

## 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| Frontend | React 19, Vite, JavaScript, CSS |
| Backend | Node.js, Express 5, CORS |
| Database | PostgreSQL (`pg`) |
| 배포 | Render (Blueprint: `render.yaml`) |

## 폴더 구조

```
.
├── docs/PRD.md        # 화면·데이터 모델·API 기획 문서
├── ui/                # React 프런트엔드 (Vite)
│   ├── public/menu/   # 메뉴 이미지
│   └── src/App.jsx
├── server/            # Express 백엔드
│   ├── src/           # 서버 코드 (index.js, db.js)
│   ├── sql/           # 스키마(001_schema.sql), 시드(002_seed.sql)
│   └── scripts/       # DB 생성/마이그레이션/시드/검증 스크립트
├── 와이어프레임/        # 화면 설계 이미지
└── render.yaml        # Render 배포 설정
```

## 시작하기

### 사전 준비
- Node.js 22 이상 권장
- PostgreSQL 실행 중일 것

### 1. 백엔드 실행 (기본 포트 4000)

```bash
cd server
npm install
cp .env.example .env   # DB 정보에 맞게 수정
npm run db:create      # DB 생성 (없을 때만)
npm run db:migrate     # 테이블 생성
npm run db:seed        # 기본 메뉴/옵션 입력
npm run dev
```

### 2. 프런트엔드 실행 (기본 포트 5173)

```bash
cd ui
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173` 으로 접속합니다.

## 환경 변수

### server/.env

| 변수 | 설명 |
| --- | --- |
| `PORT` | 서버 포트 (기본 4000) |
| `CORS_ORIGIN` | 허용할 프런트 주소 (쉼표로 여러 개) |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | PostgreSQL 연결 정보 |
| `DATABASE_URL` | 배포 환경용 연결 문자열 (설정하면 우선 사용) |
| `AUTO_MIGRATE` / `AUTO_SEED` | `true`면 서버 부팅 시 SQL 자동 적용 |

### ui/.env

| 변수 | 설명 |
| --- | --- |
| `VITE_API_BASE_URL` | API 서버 주소 (기본 `http://127.0.0.1:4000`) |

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/health` | 서버 상태 확인 |
| GET | `/api/health/db` | DB 연결 확인 |
| GET | `/api/menus` | 메뉴 + 옵션 + 재고 조회 |
| PATCH | `/api/menus/:menuId/stock` | 재고 증감 (`delta`) |
| POST | `/api/orders` | 주문 생성 (서버에서 금액 재계산, 재고 차감) |
| GET | `/api/orders` | 주문 목록 조회 |
| GET | `/api/orders/:orderId` | 주문 상세 조회 |
| PATCH | `/api/orders/:orderId/status` | 주문 상태 변경 (`nextStatus`) |

주문 상태: `RECEIVED` → `IN_PROGRESS` → `COMPLETED`

## 데이터 모델

`Menus` · `Options` · `Orders` · `OrderItems` 4개 테이블로 구성되며, 주문 시점의 메뉴명과 옵션명은 스냅샷으로 저장합니다. 자세한 내용은 [`docs/PRD.md`](docs/PRD.md)를 참고하세요.

## 배포

Render Blueprint(`render.yaml`)로 API 서버, 정적 UI, PostgreSQL을 함께 배포합니다.
최초 적용 시 대시보드에서 `CORS_ORIGIN`(UI 주소)과 `VITE_API_BASE_URL`(API 주소)을 직접 입력해야 합니다.
