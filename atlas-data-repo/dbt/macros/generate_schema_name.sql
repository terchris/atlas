{#
  Override dbt's default schema-name generation so that a model configured
  with `+schema: marts` writes to the `marts` schema (not `{target.schema}_marts`).
  Standard dbt idiom — see https://docs.getdbt.com/docs/build/custom-schemas.
#}

{% macro generate_schema_name(custom_schema_name, node) -%}
  {%- if custom_schema_name is none -%}
    {{ target.schema }}
  {%- else -%}
    {{ custom_schema_name | trim }}
  {%- endif -%}
{%- endmacro %}
