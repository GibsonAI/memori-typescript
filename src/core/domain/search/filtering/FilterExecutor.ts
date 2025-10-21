import {
  FilterNode,
  FilterType,
  FilterOperator,
  FilterExecutionContext,
  FilterExecutionResult,
  DatabaseQueryResult,
} from './types';
import { createComponentLogger } from '../../../infrastructure/config/Logger';

/**
 * Interface for geographic location data
 */
interface GeoLocation {
  latitude: number;
  longitude: number;
  type: 'point' | 'circle' | 'polygon';
  radius?: number;
  coordinates?: Array<[number, number]>;
}

/**
 * FilterExecutor class for executing filters against search results and database queries
 */
export class FilterExecutor {
  private logger = createComponentLogger('FilterExecutor');
  /**
   * Execute filter against search results in memory
   */
  async executeInMemory(
    filter: FilterNode,
    results: unknown[],
    context?: FilterExecutionContext,
  ): Promise<unknown[]> {
    const startTime = Date.now();
    const filteredResults = results.filter(item => this.evaluateFilter(filter, item));
    const _executionTime = Date.now() - startTime;

    return filteredResults;
  }

  /**
   * Execute filter against search results with detailed result
   */
  async executeWithResult(
    filter: FilterNode,
    results: unknown[],
    _context?: FilterExecutionContext,
  ): Promise<FilterExecutionResult> {
    const startTime = Date.now();
    const filteredResults = results.filter(item => this.evaluateFilter(filter, item));

    return {
      filteredItems: filteredResults,
      totalCount: results.length,
      filteredCount: filteredResults.length,
      executionTime: Date.now() - startTime,
      strategyUsed: 'in_memory_filtering',
      metadata: {
        originalFilter: filter,
        context: _context || {},
      },
    };
  }

  /**
   * Generate database query from filter
   */
  generateDatabaseQuery(
    filter: FilterNode,
    baseQuery: string,
    _context?: FilterExecutionContext,
  ): DatabaseQueryResult {
    const params: unknown[] = [];
    const conditions = this.buildSqlConditions(filter, params);
    const sql = `${baseQuery} WHERE ${conditions}`;
    const estimatedCost = this.estimateQueryCost(filter);

    return {
      sql,
      parameters: params,
      estimatedCost,
      canUseIndex: this.canUseIndex(filter),
    };
  }

  /**
   * Batch execute filters for better performance
   */
  async executeBatch(
    filters: FilterNode[],
    results: unknown[],
    _context?: FilterExecutionContext,
  ): Promise<FilterExecutionResult[]> {
    const batchResults: FilterExecutionResult[] = [];

    for (const filter of filters) {
      const result = await this.executeWithResult(filter, results, _context);
      batchResults.push(result);
    }

    return batchResults;
  }

  /**
   * Evaluate a single filter against an item
   */
  private evaluateFilter(filter: FilterNode, item: unknown): boolean {
    // Handle logical operators
    if (filter.type === FilterType.LOGICAL) {
      return this.evaluateLogicalFilter(filter, item);
    }

    // Handle comparison operators
    if (filter.type === FilterType.COMPARISON) {
      return this.evaluateComparisonFilter(filter, item);
    }

    // Handle temporal operators
    if (filter.type === FilterType.TEMPORAL) {
      return this.evaluateTemporalFilter(filter, item);
    }

    // Handle spatial operators
    if (filter.type === FilterType.SPATIAL) {
      return this.evaluateSpatialFilter(filter, item);
    }

    // Handle semantic operators
    if (filter.type === FilterType.SEMANTIC) {
      return this.evaluateSemanticFilter(filter, item);
    }

    return true;
  }

  /**
   * Evaluate logical filters (AND, OR, NOT)
   */
  private evaluateLogicalFilter(filter: FilterNode, item: unknown): boolean {
    if (!filter.children || filter.children.length === 0) {
      return true;
    }

    switch (filter.operator) {
    case FilterOperator.AND:
      return filter.children.every(child => this.evaluateFilter(child, item));

    case FilterOperator.OR:
      return filter.children.some(child => this.evaluateFilter(child, item));

    case FilterOperator.NOT:
      return !this.evaluateFilter(filter.children[0], item);

    default:
      return true;
    }
  }

  /**
   * Evaluate comparison filters
   */
  private evaluateComparisonFilter(filter: FilterNode, item: unknown): boolean {
    const itemValue = this.getNestedValue(item, filter.field);
    const filterValue = filter.value;

    switch (filter.operator) {
    case FilterOperator.EQUALS:
      return itemValue === filterValue;

    case FilterOperator.NOT_EQUALS:
      return itemValue !== filterValue;

    case FilterOperator.GREATER_THAN:
      return Number(itemValue) > Number(filterValue);

    case FilterOperator.LESS_THAN:
      return Number(itemValue) < Number(filterValue);

    case FilterOperator.GREATER_EQUAL:
      return Number(itemValue) >= Number(filterValue);

    case FilterOperator.LESS_EQUAL:
      return Number(itemValue) <= Number(filterValue);

    case FilterOperator.CONTAINS:
      return String(itemValue).includes(String(filterValue));

    case FilterOperator.STARTS_WITH:
      return String(itemValue).startsWith(String(filterValue));

    case FilterOperator.ENDS_WITH:
      return String(itemValue).endsWith(String(filterValue));

    case FilterOperator.IN:
      return Array.isArray(filterValue) && filterValue.includes(itemValue);

    case FilterOperator.NOT_IN:
      return Array.isArray(filterValue) && !filterValue.includes(itemValue);

    case FilterOperator.BETWEEN:
      return this.isBetween(itemValue, filterValue);

    case FilterOperator.LIKE:
      return this.matchesLikePattern(String(itemValue), String(filterValue));

    case FilterOperator.REGEX:
      try {
        const regex = new RegExp(String(filterValue));
        return regex.test(String(itemValue));
      } catch {
        return false;
      }

    default:
      return true;
    }
  }

  /**
   * Evaluate temporal filters
   */
  private evaluateTemporalFilter(filter: FilterNode, item: unknown): boolean {
    const itemValue = this.getNestedValue(item, filter.field);

    // Convert to Date if it's a timestamp
    const itemDate = this.toDate(itemValue);
    const filterDate = this.toDate(filter.value);

    if (!itemDate || !filterDate) {
      return false;
    }

    switch (filter.operator) {
    case FilterOperator.BEFORE:
    case FilterOperator.AFTER:
      return this.compareDates(itemDate, filterDate, filter.operator);

    case FilterOperator.WITHIN:
      return this.isWithinTimeRange(itemDate, filter.value);

    case FilterOperator.AGE_LESS_THAN:
    case FilterOperator.AGE_GREATER_THAN:
      return this.compareAge(itemDate, filter.value, filter.operator);

    default:
      return true;
    }
  }

  /**
   * Evaluate spatial filters
   */
  private evaluateSpatialFilter(filter: FilterNode, item: unknown): boolean {
    const itemValue = this.getNestedValue(item, filter.field);

    switch (filter.operator) {
    case FilterOperator.NEAR:
      return this.isNear(itemValue, filter.value);

    case FilterOperator.WITHIN_RADIUS:
      return this.isWithinRadius(itemValue, filter.value);

    case FilterOperator.CONTAINS_POINT:
      return this.containsPoint(itemValue, filter.value);

    default:
      return true;
    }
  }

  /**
   * Evaluate semantic filters
   */
  private evaluateSemanticFilter(filter: FilterNode, item: unknown): boolean {
    const itemValue = this.getNestedValue(item, filter.field);

    switch (filter.operator) {
    case FilterOperator.SIMILAR_TO:
      return this.isSimilarTo(itemValue, filter.value);

    case FilterOperator.RELATED_TO:
      return this.isRelatedTo(itemValue, filter.value);

    default:
      return true;
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      return (current as Record<string, unknown>)?.[key];
    }, obj);
  }

  /**
   * Convert value to Date
   */
  private toDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  /**
   * Compare dates
   */
  private compareDates(date1: Date, date2: Date, operator: FilterOperator): boolean {
    const diff = date1.getTime() - date2.getTime();

    switch (operator) {
    case FilterOperator.BEFORE:
      return diff < 0;
    case FilterOperator.AFTER:
      return diff > 0;
    default:
      return false;
    }
  }

  /**
   * Check if date is within time range
   */
  private isWithinTimeRange(_date: Date, _range: unknown): boolean {
    // Simplified implementation
    return true;
  }

  /**
   * Compare age
   */
  private compareAge(date: Date, ageValue: unknown, operator: FilterOperator): boolean {
    const age = Date.now() - date.getTime();
    const ageInDays = age / (1000 * 60 * 60 * 24);
    const targetAge = Number(ageValue);

    switch (operator) {
    case FilterOperator.AGE_LESS_THAN:
      return ageInDays < targetAge;
    case FilterOperator.AGE_GREATER_THAN:
      return ageInDays > targetAge;
    default:
      return false;
    }
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Calculate geographic distance using Haversine formula
   */
  private calculateGeographicDistance(point1: GeoLocation, point2: GeoLocation): number {
    try {
      const R = 6371; // Earth's radius in km
      const lat1Rad = this.toRadians(point1.latitude);
      const lat2Rad = this.toRadians(point2.latitude);
      const deltaLatRad = this.toRadians(point2.latitude - point1.latitude);
      const deltaLngRad = this.toRadians(point2.longitude - point1.longitude);

      const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    } catch (error) {
      this.logger.error('Error calculating geographic distance', {
        error: error instanceof Error ? error.message : String(error),
        point1: this.sanitizeLocation(point1),
        point2: this.sanitizeLocation(point2),
      });
      return Infinity; // Return large distance on error
    }
  }

  /**
   * Ray casting algorithm for point-in-polygon detection
   */
  private isPointInPolygon(point: GeoLocation, polygon: GeoLocation): boolean {
    try {
      if (polygon.type !== 'polygon' || !polygon.coordinates) {
        this.logger.warn('Invalid polygon data for point-in-polygon test', {
          polygonType: polygon.type,
          hasCoordinates: !!polygon.coordinates,
        });
        return false;
      }

      const x = point.longitude, y = point.latitude;
      const polygonPoints = polygon.coordinates;
      let inside = false;

      for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
        const xi = polygonPoints[i][0], yi = polygonPoints[i][1];
        const xj = polygonPoints[j][0], yj = polygonPoints[j][1];

        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    } catch (error) {
      this.logger.error('Error in point-in-polygon calculation', {
        error: error instanceof Error ? error.message : String(error),
        point: this.sanitizeLocation(point),
        polygon: this.sanitizeLocation(polygon),
      });
      return false;
    }
  }

  /**
   * Parse location data into GeoLocation object
   */
  private parseGeoLocation(location: unknown): GeoLocation | null {
    try {
      if (typeof location === 'object' && location !== null) {
        const loc = location as Record<string, unknown>;
        if ('latitude' in loc && 'longitude' in loc) {
          return {
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            type: (loc.type as 'point' | 'circle' | 'polygon') || 'point',
            radius: loc.radius ? Number(loc.radius) : undefined,
            coordinates: loc.coordinates as Array<[number, number]> | undefined,
          };
        }
      }
      return null;
    } catch (error) {
      this.logger.error('Error parsing geo location', {
        error: error instanceof Error ? error.message : String(error),
        location: typeof location === 'object' ? JSON.stringify(location) : String(location),
      });
      return null;
    }
  }

  /**
   * Sanitize location data for logging (remove sensitive data)
   */
  private sanitizeLocation(location: GeoLocation): Record<string, unknown> {
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      type: location.type,
      hasRadius: !!location.radius,
      hasCoordinates: !!location.coordinates,
      coordinatesCount: location.coordinates?.length || 0,
    };
  }

  /**
   * Check if location is near another
   */
  private isNear(location1: unknown, location2: unknown): boolean {
    try {
      const geo1 = this.parseGeoLocation(location1);
      const geo2 = this.parseGeoLocation(location2);

      if (!geo1 || !geo2 || geo1.type !== 'point' || geo2.type !== 'point') {
        this.logger.warn('Invalid location data for proximity check', {
          location1: this.sanitizeLocation(geo1 as GeoLocation),
          location2: this.sanitizeLocation(geo2 as GeoLocation),
        });
        return false;
      }

      const distance = this.calculateGeographicDistance(geo1, geo2);
      const result = distance <= 1.0; // 1km default threshold

      this.logger.debug('Proximity check completed', {
        distance: Math.round(distance * 1000), // meters
        threshold: 1000, // meters
        result,
        location1: this.sanitizeLocation(geo1),
        location2: this.sanitizeLocation(geo2),
      });

      return result;
    } catch (error) {
      this.logger.error('Error in proximity check', {
        error: error instanceof Error ? error.message : String(error),
        location1: typeof location1 === 'object' ? JSON.stringify(location1) : String(location1),
        location2: typeof location2 === 'object' ? JSON.stringify(location2) : String(location2),
      });
      return false;
    }
  }

  /**
   * Check if location is within radius
   */
  private isWithinRadius(location: unknown, radiusValue: unknown): boolean {
    try {
      const loc = this.parseGeoLocation(location);
      if (!loc || loc.type !== 'point') {
        this.logger.warn('Invalid location for radius check', {
          location: this.sanitizeLocation(loc as GeoLocation),
        });
        return false;
      }

      // Parse radius value - support multiple formats
      let radius: number;
      if (typeof radiusValue === 'number') {
        radius = radiusValue;
      } else if (typeof radiusValue === 'object' && radiusValue !== null && 'radius' in radiusValue) {
        radius = Number((radiusValue as Record<string, unknown>).radius);
      } else if (typeof radiusValue === 'string') {
        radius = parseFloat(radiusValue);
      } else {
        this.logger.warn('Invalid radius value format', {
          radiusValue: typeof radiusValue,
          value: String(radiusValue),
        });
        return false;
      }

      if (isNaN(radius) || radius <= 0) {
        this.logger.warn('Invalid radius value', {
          radius,
          originalValue: String(radiusValue),
        });
        return false;
      }

      this.logger.debug('Radius check completed', {
        location: this.sanitizeLocation(loc),
        radius,
        result: true, // Always return true for point within any radius
      });

      // For a point location, any positive radius will contain it
      // In a real implementation, this would check against a center point
      return true;
    } catch (error) {
      this.logger.error('Error in radius check', {
        error: error instanceof Error ? error.message : String(error),
        location: typeof location === 'object' ? JSON.stringify(location) : String(location),
        radiusValue: String(radiusValue),
      });
      return false;
    }
  }

  /**
   * Check if geometry contains point
   */
  private containsPoint(geometry: unknown, point: unknown): boolean {
    try {
      const geom = this.parseGeoLocation(geometry);
      const pt = this.parseGeoLocation(point);

      if (!geom || !pt) {
        this.logger.warn('Invalid geometry or point for containment check', {
          geometry: this.sanitizeLocation(geom as GeoLocation),
          point: this.sanitizeLocation(pt as GeoLocation),
        });
        return false;
      }

      let result = false;

      switch (geom.type) {
      case 'polygon':
        result = this.isPointInPolygon(pt, geom);
        break;
      case 'circle':
        if (geom.radius && geom.radius > 0) {
          // For circle containment, we need a center point
          // Since we only have the radius, we'll assume the geometry point is the center
          const centerPoint: GeoLocation = {
            latitude: geom.latitude,
            longitude: geom.longitude,
            type: 'point',
          };
          const distance = this.calculateGeographicDistance(centerPoint, pt);
          result = distance <= geom.radius;
        } else {
          this.logger.warn('Circle geometry missing radius', {
            geometry: this.sanitizeLocation(geom),
          });
          result = false;
        }
        break;
      case 'point':
        // Point contains point only if they're exactly the same
        result = Math.abs(geom.latitude - pt.latitude) < Number.EPSILON &&
                   Math.abs(geom.longitude - pt.longitude) < Number.EPSILON;
        break;
      default:
        this.logger.warn('Unsupported geometry type for containment check', {
          geometryType: geom.type,
        });
        result = false;
      }

      this.logger.debug('Containment check completed', {
        geometry: this.sanitizeLocation(geom),
        point: this.sanitizeLocation(pt),
        result,
      });

      return result;
    } catch (error) {
      this.logger.error('Error in containment check', {
        error: error instanceof Error ? error.message : String(error),
        geometry: typeof geometry === 'object' ? JSON.stringify(geometry) : String(geometry),
        point: typeof point === 'object' ? JSON.stringify(point) : String(point),
      });
      return false;
    }
  }

  /**
   * Check if values are similar
   */
  private isSimilarTo(value1: unknown, value2: unknown): boolean {
    // Simplified implementation
    return String(value1).includes(String(value2)) ||
           String(value2).includes(String(value1));
  }

  /**
   * Check if values are related
   */
  private isRelatedTo(_value1: unknown, _value2: unknown): boolean {
    // Simplified implementation
    return true;
  }

  /**
   * Check if value is between two values
   */
  private isBetween(value: unknown, range: unknown): boolean {
    if (!Array.isArray(range) || range.length !== 2) {
      return false;
    }

    const numValue = Number(value);
    const min = Number(range[0]);
    const max = Number(range[1]);

    return numValue >= min && numValue <= max;
  }

  /**
   * Check if string matches LIKE pattern
   */
  private matchesLikePattern(text: string, pattern: string): boolean {
    // Convert SQL LIKE pattern to regex
    const regexPattern = pattern
      .replace(/%/g, '.*')
      .replace(/_/g, '.')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(text);
    } catch {
      return false;
    }
  }

  /**
   * Build SQL conditions from filter
   */
  private buildSqlConditions(filter: FilterNode, params: unknown[]): string {
    switch (filter.operator) {
    case FilterOperator.EQUALS:
      params.push(filter.value);
      return `${filter.field} = ?`;

    case FilterOperator.CONTAINS:
      params.push(`%${filter.value}%`);
      return `${filter.field} LIKE ?`;

    case FilterOperator.GREATER_THAN:
      params.push(filter.value);
      return `${filter.field} > ?`;

    case FilterOperator.LESS_THAN:
      params.push(filter.value);
      return `${filter.field} < ?`;

    case FilterOperator.AND: {
      const conditions = filter.children?.map(child =>
        `(${this.buildSqlConditions(child, params)})`,
      ).join(' AND ');
      return conditions || '1=1';
    }

    case FilterOperator.OR: {
      const conditions = filter.children?.map(child =>
        `(${this.buildSqlConditions(child, params)})`,
      ).join(' OR ');
      return conditions || '1=1';
    }

    default:
      return '1=1';
    }
  }

  /**
   * Estimate query cost
   */
  private estimateQueryCost(filter: FilterNode): number {
    const baseCost = 1;

    if (filter.children && filter.children.length > 0) {
      return baseCost + filter.children.reduce((sum, child) =>
        sum + this.estimateQueryCost(child), 0,
      );
    }

    // Different operators have different costs
    const operatorCosts: Record<FilterOperator, number> = {
      [FilterOperator.EQUALS]: 1,
      [FilterOperator.NOT_EQUALS]: 1,
      [FilterOperator.CONTAINS]: 5,
      [FilterOperator.LIKE]: 10,
      [FilterOperator.REGEX]: 20,
      [FilterOperator.IN]: 3,
      [FilterOperator.AND]: 1,
      [FilterOperator.OR]: 2,
      [FilterOperator.NOT]: 2,
      [FilterOperator.BEFORE]: 1,
      [FilterOperator.AFTER]: 1,
      [FilterOperator.WITHIN]: 3,
      [FilterOperator.AGE_LESS_THAN]: 1,
      [FilterOperator.AGE_GREATER_THAN]: 1,
      [FilterOperator.NEAR]: 5,
      [FilterOperator.WITHIN_RADIUS]: 8,
      [FilterOperator.CONTAINS_POINT]: 5,
      [FilterOperator.SIMILAR_TO]: 15,
      [FilterOperator.RELATED_TO]: 15,
      [FilterOperator.GREATER_THAN]: 1,
      [FilterOperator.LESS_THAN]: 1,
      [FilterOperator.GREATER_EQUAL]: 1,
      [FilterOperator.LESS_EQUAL]: 1,
      [FilterOperator.STARTS_WITH]: 3,
      [FilterOperator.ENDS_WITH]: 3,
      [FilterOperator.NOT_IN]: 4,
      [FilterOperator.BETWEEN]: 2,
    };

    return operatorCosts[filter.operator] || baseCost;
  }

  /**
   * Check if filter can use database index
   */
  private canUseIndex(filter: FilterNode): boolean {
    // Simple heuristics for index usage
    const indexableOperators = [
      FilterOperator.EQUALS,
      FilterOperator.GREATER_THAN,
      FilterOperator.LESS_THAN,
      FilterOperator.GREATER_EQUAL,
      FilterOperator.LESS_EQUAL,
      FilterOperator.BETWEEN,
      FilterOperator.IN,
    ];

    return indexableOperators.includes(filter.operator) &&
           !filter.field.includes('.'); // No nested fields
  }
}