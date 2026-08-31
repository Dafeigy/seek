# Development-only image. Keep PostgreSQL major and extension versions fixed
# before using this image for CI or production.
FROM groonga/pgroonga:latest-debian-17

ARG PGVECTOR_VERSION=0.8.6

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       ca-certificates \
       postgresql-server-dev-17 \
       wget \
    && wget -q "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" \
       -O /tmp/pgvector.tar.gz \
    && mkdir -p /tmp/pgvector \
    && tar -xzf /tmp/pgvector.tar.gz --strip-components=1 -C /tmp/pgvector \
    && make -C /tmp/pgvector OPTFLAGS="" \
    && make -C /tmp/pgvector install \
    && rm -rf /tmp/pgvector /tmp/pgvector.tar.gz \
    && apt-get purge -y build-essential postgresql-server-dev-17 wget \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY init/ /docker-entrypoint-initdb.d/
