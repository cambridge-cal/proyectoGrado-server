# TKT-019 · Prueba de rendimiento del motor de IA

Exploración del requisito **RNF-02**: el motor (AG + Búsqueda Tabú + Gemini) debe generar un horario completo en menos de 3 minutos para una institución de hasta 50 docentes y 30 grupos. Esta prueba mide la parte local del motor, AG y Búsqueda Tabú. El tiempo de Gemini se mide en TKT-006 y se suma en TKT-020.

## Cómo se ejecuta

```bash
npm run rendimiento:motor          # 5 repeticiones por escenario
npm run rendimiento:motor -- 10    # 10 repeticiones
```

El script genera instituciones ficticias con 50 docentes y 30 grupos, cada una con una semilla distinta, y usa los parámetros de la sección 6.3.1: población 50, 100 generaciones, cruce 80 %, mutación 10 %, 50 iteraciones de Búsqueda Tabú y lista tabú de 20.

## Escenarios

| Escenario | Aulas | Franjas | Disponibilidad docente | Sesiones a programar |
|---|---|---|---|---|
| Holgado | 15 | 6 días x 7 | 60 % | 60 |
| Medio | 6 | 5 días x 6 | 50 % | 60 |
| Ajustado | 3 | 5 días x 4 | 50 % | 60 en 60 espacios aula-franja |
| Intensivo | 8 | 6 días x 7 | 40 % | 120 (grupos de 8 h/semana) |

El escenario ajustado tiene exactamente tantos espacios aula-franja como sesiones, y no todas las aulas tienen capacidad para todos los grupos, así que es posible que algunas instancias no tengan solución.

## Resultados

Equipo: Intel Xeon 2.10 GHz, Node.js 22, 10 repeticiones por escenario.

| Escenario | Tiempo mínimo | Tiempo promedio | Tiempo máximo | Horarios factibles | Intentos promedio |
|---|---|---|---|---|---|
| Holgado | 25 ms | 30 ms | 40 ms | 10 de 10 | 1,0 |
| Medio | 19 ms | 27 ms | 35 ms | 10 de 10 | 1,0 |
| Ajustado | 266 ms | 1.323 ms | 2.209 ms | 6 de 10 | 2,1 |
| Intensivo | 32 ms | 60 ms | 273 ms | 10 de 10 | 1,0 |

## Conclusiones

1. **RNF-02 se cumple con amplio margen.** El peor caso fue 2,2 segundos, menos del 2 % del límite de 3 minutos. Queda casi todo el margen para la llamada a Gemini (TKT-020), cuyo tiempo se mide en TKT-006.
2. **La Búsqueda Tabú es la que resuelve los casos difíciles.** En el escenario ajustado el AG termina con violaciones y la Búsqueda Tabú las elimina en la mayoría de las ejecuciones.
3. **Cuando no encuentra solución, el motor lo informa.** En las 4 instancias ajustadas que no resolvió, el motor hizo los 3 intentos con parámetros aumentados y devolvió las restricciones no satisfechas, como indica la Figura 6.4.
4. **Recomendación:** dejar los parámetros por defecto. Si la institución crece, se pueden subir con las variables `MOTOR_*` del `.env` sin recompilar (RNF-30).
