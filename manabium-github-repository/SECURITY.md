# Manabium セキュリティ運用

## ブラウザから見えてよいもの

`SUPABASE_URL`と`sb_publishable_...`で始まるPublishable keyは、Webアプリの仕組み上ブラウザから確認できます。これは秘密鍵ではなく、データへのアクセスはPostgreSQLのRLSと列権限で拒否します。`sb_secret_...`、`service_role`、SMTPパスワード、Cloudflare API TokenはHTML・JavaScript・Gitへ絶対に追加しません。

利用者本人のブラウザには、ログイン処理のため本人のメールアドレスとセッションが存在します。本人以外のメールアドレス、本名、管理メモ、分析ログ、管理者一覧をブラウザへ返さないことが必須条件です。

分析イベントはログイン済み利用者だけ記録します。`record_analytics_events`は`SECURITY DEFINER`のため`anon`へ実行権限を付与せず、Cloudflare Pages FunctionでもBearerトークンを必須にします。未ログイン状態の流入計測は、安全なサーバー専用取り込み口を用意するまで行いません。

管理者向けRPCは`authenticated`から直接実行できません。ブラウザからCloudflare Pages Functionsへ利用者のBearerトークンを送り、Functionsが管理者判定を行った後だけ、Cloudflareの暗号化Secretである`SUPABASE_SECRET_KEY`を`apikey`ヘッダーに設定して呼び出します。`SUPABASE_SECRET_KEY`にはSupabaseの`sb_secret_...`キーを設定し、ブラウザ、Git、SQLファイル、チャットへ貼り付けません。

ログイン直後のセッション文脈は`get_my_session_context()`で一度だけ取得します。このRPCは入力値を受け取らず、JWTの`auth.uid()`本人の卒業予定年と「管理者か否か」だけを返します。`SECURITY DEFINER`ですが`search_path`を空に固定し、`anon`の実行権限を剥奪しています。管理者レコード、他人の卒業予定年、メールアドレスは返しません。一般ユーザーに`app_user_roles`の行がない場合はエラーではなく`is_admin: false`です。

## テスト公開前の必須作業

1. Supabase SQL Editorで`supabase/fix-private-session-context.sql`を実行し、最後の結果が`true / false / true / false / false`になることを確認する。
2. `supabase/security-hardening.sql`を実行し、最後の4項目がすべて`false`になることを確認する。
3. SupabaseのDatabase > Security Advisorで未解決のRLS・関数・権限警告を確認する。
4. Authenticationでメール確認を有効にし、パスワード最小長を10文字以上にする。
5. Authentication > Bot and Abuse ProtectionでCloudflare Turnstileを設定する。設定するまでは招待制テストに限定する。
6. 本番メールはCustom SMTPを使用し、Authの送信制限を確認する。
7. Supabase、Cloudflare、GitHubの運営アカウントへ多要素認証を設定する。
8. 管理者権限はAuth > Usersで対象者のUUIDを確認し、SQL Editorから`app_user_roles`へ手動登録する。メールアドレスをSQLファイルへ保存しない。
9. Cloudflare PagesのProduction環境へ`SUPABASE_SECRET_KEY`を暗号化Secretとして登録し、`supabase/restrict-admin-rpcs-to-server.sql`を実行してから再デプロイする。
10. API SettingsのExposed schemasに`private`が含まれていないことを確認する。

## 運営室に「Admin API is not configured.」と出るとき

SQLを削除したり、管理者RPCを一般ユーザーへ開放したりしないでください。これはCloudflare側の環境設定不足です。CloudflareでManabiumのSettings → Variables and Secretsを開き、Production環境の`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`を確認し、`SUPABASE_SECRET_KEY`をSecretとして登録して再デプロイします。値は同じSupabaseプロジェクトのAPI Keysにある`sb_secret_...`キーです。秘密鍵はチャット・Git・ブラウザ用コードに貼らないでください。

旧形式のservice_role JWTが既に設定されている環境では`SUPABASE_SERVICE_ROLE_KEY`もサーバー内のみ受け付けます。新しいSecret keyはapikeyだけ、旧JWTはapikeyとAuthorizationに設定します。利用者のBearerトークンを特権リクエストへ流用することはありません。[Supabase公式API key仕様](https://supabase.com/docs/guides/getting-started/api-keys)

## 回帰テスト

- 未ログイン状態で`profiles`、`posts`、`post_replies`、`lakeside_notes`をREST APIから取得できない。
- 一般ユーザーが`profiles.nickname`、`graduation_year`、`last_accessed_at`を取得できない。
- 一般ユーザーが各コンテンツの`moderation_note`、`moderated_by`、`moderated_at`を取得できない。
- 別ユーザーのプロフィール編集、投稿編集、保存一覧、ミュート設定を変更できない。
- 一般ユーザーが管理者RPCと`/api/admin/*`を実行できない。
- `authenticated`が管理者RPCを直接実行できず、`service_role`だけに`EXECUTE`が付与されている。
- Realtimeのイベントに、許可した列以外が含まれない。
- 認証コールバックの`code`、アクセストークン、エラー内容が分析ログへ保存されない。

## インシデント時

秘密鍵がGitやブラウザへ出た場合は、該当キーを直ちにローテーションし、Cloudflareの変数と利用サービスを更新します。Publishable keyだけが見えた場合は通常の動作ですが、RLSの異常が疑われる場合は新規登録と書き込みを止め、Security Advisor、管理ログ、該当ポリシーを確認します。利用者データを端末へダウンロードして調査せず、必要最小限の管理画面・集計データだけを扱います。
