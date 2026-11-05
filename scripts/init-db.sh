#!/bin/sh
set -eu
# This script runs only when the PostgreSQL data volume is empty.
# psql variable quoting prevents password values from becoming SQL syntax.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=flowpilot_password="$FLOWPILOT_DB_PASSWORD" \
  --set=n8n_password="$N8N_DB_PASSWORD" <<'SQL'
CREATE ROLE flowpilot LOGIN PASSWORD :'flowpilot_password';
CREATE DATABASE flowpilot OWNER flowpilot;
REVOKE CONNECT ON DATABASE flowpilot FROM PUBLIC;
GRANT CONNECT ON DATABASE flowpilot TO flowpilot;
CREATE ROLE n8n LOGIN PASSWORD :'n8n_password';
CREATE DATABASE n8n OWNER n8n;
REVOKE CONNECT ON DATABASE n8n FROM PUBLIC;
GRANT CONNECT ON DATABASE n8n TO n8n;
SQL
