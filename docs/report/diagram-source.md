# Ngu?n Mermaid c?a c?c s? ?? b?o c?o

C?c t?p `.mmd` d??i ??y l? m? ngu?n Mermaid ???c ??i chi?u v?i repository. Khi c? Mermaid CLI, xu?t m?i t?p th?nh PDF c?nh ngu?n r?i bi?n d?ch `main.tex` l?i.

## 01-chuc-nang.mmd

```mermaid
flowchart TB
    SYS[Hệ thống thông tin Hung Fashion]
    SYS --> ACC[Quản lý tài khoản và phân quyền]
    SYS --> CAT[Quản lý sản phẩm và danh mục]
    SYS --> INV[Quản lý tồn kho và nhà cung cấp]
    SYS --> ORD[Quản lý đơn hàng và thanh toán]
    SYS --> CRM[Quản lý quan hệ khách hàng]
    SYS --> RPT[Báo cáo, nhật ký và cấu hình]
    CRM --> CUS[Hồ sơ, hạng và sở thích]
    CRM --> FB[Phản hồi và chat CSKH]
    CRM --> SUR[Khảo sát và thống kê]
    ORD --> CHECK[Checkout và QR demo]
    ORD --> PROMO[Khuyến mãi]
```

## 02-ngu-canh.mmd

```mermaid
flowchart LR
    Customer[Khách hàng]
    Staff[Nhân viên CSKH]
    Admin[Quản trị viên]
    Sales[Quản lý bán hàng]
    Warehouse[Quản lý kho]
    HR[Quản lý nhân sự]
    System((HTTT Hung Fashion))
    Customer -->|Hồ sơ, đơn mua, đánh giá, trả lời khảo sát, tin nhắn| System
    System -->|Catalog, trạng thái đơn, voucher, khảo sát, trả lời chat| Customer
    Admin -->|Tài khoản, quyền, cấu hình, yêu cầu báo cáo| System
    System -->|Danh sách, trạng thái, báo cáo, nhật ký| Admin
    Staff -->|Phản hồi, khảo sát, hội thoại| System
    System -->|Hồ sơ khách, trạng thái, thống kê| Staff
    Sales -->|Đơn tại quầy, trạng thái thanh toán, khuyến mãi| System
    System -->|Đơn, thanh toán, hóa đơn, báo cáo| Sales
    Warehouse -->|Sản phẩm, phiếu kho, nhà cung cấp| System
    System -->|Tồn kho, catalog, cảnh báo| Warehouse
    HR -->|Hồ sơ nhân sự| System
    System -->|Danh sách nhân viên, báo cáo được cấp quyền| HR
```

## 03-dfd-muc-0.mmd

```mermaid
flowchart LR
    Customer[Khách hàng]
    Admin[ADMIN]
    CRM[QL KHÁCH HÀNG]
    Sales[QL BÁN HÀNG]
    Warehouse[QL KHO]
    P1((1. Quản lý tài khoản và hồ sơ))
    P2((2. Quản lý catalog và tồn kho))
    P3((3. Xử lý đơn và thanh toán))
    P4((4. CRM: phản hồi, chat, khảo sát))
    P5((5. Báo cáo và sự kiện))
    D1[(D1 Account, role, employee, customer)]
    D2[(D2 Product, variant, supplier, receipts)]
    D3[(D3 Order, detail, payment)]
    D4[(D4 Feedback, survey, chat, loyalty)]
    D5[(D5 Outbox, user_events, transactions)]
    Customer --> P1
    P1 <--> D1
    P1 --> Customer
    Warehouse <--> P2
    P2 <--> D2
    P2 --> P3
    Customer --> P3
    Sales <--> P3
    P3 <--> D3
    P3 --> D5
    Customer <--> P4
    CRM <--> P4
    P4 <--> D4
    P4 --> D5
    Admin --> P1
    Admin --> P5
    Sales --> P5
    Warehouse --> P5
    CRM --> P5
    D1 --> P5
    D2 --> P5
    D3 --> P5
    D4 --> P5
    D5 --> P5
    P5 --> Admin
    P5 --> Sales
    P5 --> Warehouse
    P5 --> CRM
```

## 04-erd.mmd

```mermaid
erDiagram
    ROLE ||--o{ ACCOUNT : grants
    ACCOUNT ||--o| CUSTOMER : profile
    ACCOUNT ||--o| EMPLOYEE : profile
    CUSTOMER ||--o{ CUSTOMER_INTEREST : has
    INTEREST ||--o{ CUSTOMER_INTEREST : classifies
    CATEGORY ||--o{ PRODUCT : contains
    BRAND ||--o{ PRODUCT : labels
    SUPPLIER ||--o{ PRODUCT : supplies
    PRODUCT ||--o{ PRODUCT_VARIANT : has
    SIZE ||--o{ PRODUCT_VARIANT : sizes
    COLOR ||--o{ PRODUCT_VARIANT : colors
    SUPPLIER ||--o{ IMPORT_RECEIPT : source
    IMPORT_RECEIPT ||--|{ IMPORT_DETAIL : contains
    PRODUCT_VARIANT ||--o{ IMPORT_DETAIL : item
    CUSTOMER ||--o{ ORDER : places
    EMPLOYEE ||--o{ ORDER : handles
    ORDER ||--|{ ORDER_DETAIL : contains
    PRODUCT_VARIANT ||--o{ ORDER_DETAIL : item
    ORDER ||--o| PAYMENT : paid_by
    ORDER ||--o{ FEEDBACK : referenced_by
    CUSTOMER ||--o{ FEEDBACK : writes
    FEEDBACK ||--o{ FEEDBACK_ATTACHMENT : includes
    CUSTOMER ||--o{ CONVERSATION : contacts
    CONVERSATION ||--o{ CHAT_MESSAGE : contains
    CHAT_MESSAGE ||--o{ CHAT_MESSAGE_ATTACHMENT : includes
    SURVEY ||--o{ SURVEY_QUESTION : asks
    SURVEY_QUESTION ||--o{ SURVEY_OPTION : offers
    SURVEY ||--o{ SURVEY_RESPONSE : receives
    SURVEY_RESPONSE ||--o{ SURVEY_ANSWER : contains
    OUTBOX_EVENTS ||--o{ TRANSACTIONS : relays
```

## 05-trien-khai-su-kien.mmd

```mermaid
flowchart LR
    subgraph Local[Phát triển local]
      Browser[React/Vite browser]
      API[Express API]
      PG[(PostgreSQL Docker)]
      K[Kafka Docker]
      UI[Kafka UI]
    end
    subgraph Managed[Môi trường managed theo cấu hình triển khai]
      App[Express API container]
      DB[(PostgreSQL managed, SSL CA)]
      Broker[(Kafka managed, TLS client certificate)]
    end
    Browser -->|HTTP /api, JWT| API
    API --> PG
    API -->|business transaction + outbox| PG
    PG -->|poll unpublished; SKIP LOCKED| API
    API -->|user-events / transaction-events| K
    K --> API
    K --> UI
    Browser -->|HTTPS| App
    App --> DB
    App -->|outbox relay producer| Broker
    Broker -->|consumer group store-admin-group| App
    App -->|insert idempotent| DB
    Browser -->|DEMO QR URL, no bank| App
```
