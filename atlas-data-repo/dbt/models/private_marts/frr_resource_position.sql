{{ config(materialized='table', schema='private_marts', tags=['private']) }}

select * from {{ ref('supply__frr_resource_position') }}
