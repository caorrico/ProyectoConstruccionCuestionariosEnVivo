#!/bin/sh
set -eu
for svc in m3 m4 m5; do
  eval "password=\${${svc}_PASSWORD}"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=svc="$svc" --set=password="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'svc', :'password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'svc', :'svc') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'svc') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'svc', :'svc') \gexec
SQL
done
