FROM python:3.12-slim-bookworm
LABEL org.lexopen.recipe="lexopen-documents-1"
COPY --chmod=0444 recipe.py /recipe.py
USER 65532:65532
WORKDIR /tmp
# The container also expires if the Host is stopped before it can cancel Docker.
ENTRYPOINT ["timeout", "35s", "python3", "-I", "-B", "/recipe.py"]
