# Graph Report - C:\Sass_program_1\Dhaba_cafe_system_1\dashboard  (2026-04-22)

## Corpus Check
- Corpus is ~14,819 words - fits in a single context window. You may not need a graph.

## Summary
- 63 nodes · 49 edges · 17 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Authentication|Authentication]]
- [[_COMMUNITY_Error Boundary|Error Boundary]]
- [[_COMMUNITY_Billing & DateTime|Billing & DateTime]]
- [[_COMMUNITY_Payment Tokens|Payment Tokens]]
- [[_COMMUNITY_Entry Points|Entry Points]]
- [[_COMMUNITY_Menu Item Card|Menu Item Card]]
- [[_COMMUNITY_Overview Page|Overview Page]]
- [[_COMMUNITY_Featured Items|Featured Items]]
- [[_COMMUNITY_Categories Page|Categories Page]]
- [[_COMMUNITY_Add Item Modal|Add Item Modal]]
- [[_COMMUNITY_Confirm Modal|Confirm Modal]]
- [[_COMMUNITY_Offline Banner|Offline Banner]]
- [[_COMMUNITY_Toast Notifications|Toast Notifications]]
- [[_COMMUNITY_Featured Items Hook|Featured Items Hook]]
- [[_COMMUNITY_Settings Page|Settings Page]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_Supabase Lib|Supabase Lib]]

## God Nodes (most connected - your core abstractions)
1. `ErrorBoundary` - 5 edges
2. `useAuth()` - 3 edges
3. `App()` - 2 edges
4. `BillModal()` - 2 edges
5. `Login()` - 2 edges
6. `MenuItemCard()` - 2 edges
7. `debounce()` - 2 edges
8. `formatCurrency()` - 2 edges
9. `OverviewPage()` - 2 edges
10. `formatDateTime()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `qr-menu-app-dashboard` --semantically_similar_to--> `Live Order Dashboard`  [INFERRED] [semantically similar]
  README.md → index.html
- `App()` --calls--> `useAuth()`  [INFERRED]
  C:\Sass_program_1\Dhaba_cafe_system_1\dashboard\src\App.jsx → C:\Sass_program_1\Dhaba_cafe_system_1\dashboard\src\contexts\AuthContext.jsx
- `BillModal()` --calls--> `formatDateTime()`  [INFERRED]
  C:\Sass_program_1\Dhaba_cafe_system_1\dashboard\src\components\BillModal.jsx → C:\Sass_program_1\Dhaba_cafe_system_1\dashboard\src\utils\formatDateTime.js
- `Login()` --calls--> `useAuth()`  [INFERRED]
  C:\Sass_program_1\Dhaba_cafe_system_1\dashboard\src\components\Login.jsx → C:\Sass_program_1\Dhaba_cafe_system_1\dashboard\src\contexts\AuthContext.jsx

## Communities

### Community 0 - "Authentication"
Cohesion: 0.25
Nodes (3): App(), useAuth(), Login()

### Community 1 - "Error Boundary"
Cohesion: 0.33
Nodes (1): ErrorBoundary

### Community 2 - "Billing & DateTime"
Cohesion: 0.33
Nodes (2): BillModal(), formatDateTime()

### Community 3 - "Payment Tokens"
Cohesion: 0.33
Nodes (0): 

### Community 4 - "Entry Points"
Cohesion: 0.4
Nodes (4): Inter Font, Live Order Dashboard, main.jsx, qr-menu-app-dashboard

### Community 5 - "Menu Item Card"
Cohesion: 0.5
Nodes (2): debounce(), MenuItemCard()

### Community 6 - "Overview Page"
Cohesion: 0.5
Nodes (2): formatCurrency(), OverviewPage()

### Community 7 - "Featured Items"
Cohesion: 0.5
Nodes (0): 

### Community 8 - "Categories Page"
Cohesion: 0.67
Nodes (0): 

### Community 9 - "Add Item Modal"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Confirm Modal"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Offline Banner"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Toast Notifications"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Featured Items Hook"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Settings Page"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Supabase Lib"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **2 isolated node(s):** `main.jsx`, `Inter Font`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Add Item Modal`** (2 nodes): `AddItemModal()`, `AddItemModal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Confirm Modal`** (2 nodes): `ConfirmModal.jsx`, `ConfirmModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Offline Banner`** (2 nodes): `OfflineBanner.jsx`, `OfflineBanner()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Toast Notifications`** (2 nodes): `Toast.jsx`, `Toast()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Featured Items Hook`** (2 nodes): `useFeaturedItems.js`, `useFeaturedItems()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Settings Page`** (2 nodes): `SettingsPage.jsx`, `SettingsPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Supabase Lib`** (1 nodes): `supabase.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 2 inferred relationships involving `useAuth()` (e.g. with `App()` and `Login()`) actually correct?**
  _`useAuth()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `main.jsx`, `Inter Font` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._