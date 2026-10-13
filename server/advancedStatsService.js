import axios from 'axios';

class AdvancedStatisticalService {
    constructor() {
        this.pythonServiceUrl = process.env.PYTHON_STATS_SERVICE_URL || 'http://localhost:5003';
        this.timeout = 120000; // 2 minutes timeout for complex analysis
    }

    // Data Source Operations
    async loadCSVData(filePath, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/load-csv`, {
                file_path: filePath,
                options: {
                    delimiter: options.delimiter || ',',
                    header: options.header !== false,
                    encoding: options.encoding || 'utf-8',
                    ...options
                }
            }, { timeout: this.timeout });

            return {
                success: true,
                data: response.data.data,
                shape: response.data.shape,
                columns: response.data.columns,
                dtypes: response.data.dtypes
            };
        } catch (error) {
            console.error('Error loading CSV data:', error);
            throw new Error(`Failed to load CSV data: ${error.message}`);
        }
    }

    async loadExcelData(filePath, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/load-excel`, {
                file_path: filePath,
                options: {
                    sheet_name: options.sheetName || 0,
                    header: options.header !== false,
                    ...options
                }
            }, { timeout: this.timeout });

            return {
                success: true,
                data: response.data.data,
                shape: response.data.shape,
                columns: response.data.columns,
                dtypes: response.data.dtypes
            };
        } catch (error) {
            console.error('Error loading Excel data:', error);
            throw new Error(`Failed to load Excel data: ${error.message}`);
        }
    }

    // Preprocessing Operations
    async getDataInfo(data) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/data-info`, {
                data: data
            }, { timeout: this.timeout });

            return {
                success: true,
                info: {
                    shape: response.data.shape,
                    columns: response.data.columns,
                    dtypes: response.data.dtypes,
                    missingValues: response.data.missing_values,
                    memoryUsage: response.data.memory_usage,
                    summary: response.data.summary
                }
            };
        } catch (error) {
            console.error('Error getting data info:', error);
            throw new Error(`Failed to get data info: ${error.message}`);
        }
    }

    async selectColumns(data, columns) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/select-columns`, {
                data: data,
                columns: columns
            }, { timeout: this.timeout });

            return {
                success: true,
                data: response.data.data,
                shape: response.data.shape
            };
        } catch (error) {
            console.error('Error selecting columns:', error);
            throw new Error(`Failed to select columns: ${error.message}`);
        }
    }

    async removeDuplicates(data, subset = null) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/remove-duplicates`, {
                data: data,
                subset: subset
            }, { timeout: this.timeout });

            return {
                success: true,
                data: response.data.data,
                duplicatesRemoved: response.data.duplicates_removed,
                shape: response.data.shape
            };
        } catch (error) {
            console.error('Error removing duplicates:', error);
            throw new Error(`Failed to remove duplicates: ${error.message}`);
        }
    }

    async handleMissingValues(data, method = 'drop', fillValue = null) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/handle-missing`, {
                data: data,
                method: method,
                fill_value: fillValue
            }, { timeout: this.timeout });

            return {
                success: true,
                data: response.data.data,
                missingHandled: response.data.missing_handled,
                shape: response.data.shape
            };
        } catch (error) {
            console.error('Error handling missing values:', error);
            throw new Error(`Failed to handle missing values: ${error.message}`);
        }
    }

    // Statistical Analysis Operations
    async getDescriptiveStatistics(data, columns = null) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/descriptive-stats`, {
                data: data,
                columns: columns
            }, { timeout: this.timeout });

            // Python returns { success, statistics: { count, mean, ... } }
            const stats = response.data.statistics || response.data;
            return {
                success: true,
                statistics: {
                    count: stats.count,
                    mean: stats.mean,
                    std: stats.std,
                    min: stats.min,
                    max: stats.max,
                    percentiles: stats.percentiles,
                    skewness: stats.skewness,
                    kurtosis: stats.kurtosis
                }
            };
        } catch (error) {
            console.error('Error calculating descriptive statistics:', error);
            throw new Error(`Failed to calculate descriptive statistics: ${error.message}`);
        }
    }

    async correlationAnalysis(data, method = 'pearson', columns = null) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/correlation-analysis`, {
                data: data,
                method: method,
                columns: columns,
                options: { method }
            }, { timeout: this.timeout });

            return {
                success: true,
                correlation: {
                    matrix: response.data.correlation_matrix,
                    pValues: response.data.p_values,
                    method: response.data.method || method
                }
            };
        } catch (error) {
            console.error('Error performing correlation analysis:', error);
            throw new Error(`Failed to perform correlation analysis: ${error.message}`);
        }
    }

    async linearRegression(data, targetColumn, featureColumns = null) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/linear-regression`, {
                data: data,
                target_column: targetColumn,
                feature_columns: featureColumns
            }, { timeout: this.timeout });

            return {
                success: true,
                model: {
                    coefficients: response.data.coefficients,
                    intercept: response.data.intercept,
                    rSquared: response.data.r_squared,
                    adjustedRSquared: response.data.adjusted_r_squared,
                    pValues: response.data.p_values,
                    confidenceIntervals: response.data.confidence_intervals
                },
                predictions: response.data.predictions,
                residuals: response.data.residuals
            };
        } catch (error) {
            console.error('Error performing linear regression:', error);
            throw new Error(`Failed to perform linear regression: ${error.message}`);
        }
    }

    async clusteringAnalysis(data, nClusters = 3, algorithm = 'kmeans', columns = null) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/clustering`, {
                data: data,
                n_clusters: nClusters,
                algorithm: algorithm,
                columns: columns
            }, { timeout: this.timeout });

            return {
                success: true,
                clusters: {
                    labels: response.data.labels,
                    centers: response.data.centers,
                    inertia: response.data.inertia,
                    silhouetteScore: response.data.silhouette_score
                },
                algorithm: algorithm,
                nClusters: nClusters
            };
        } catch (error) {
            console.error('Error performing clustering analysis:', error);
            throw new Error(`Failed to perform clustering analysis: ${error.message}`);
        }
    }

    async hypothesisTesting(data, testType, columns, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/hypothesis-testing`, {
                data: data,
                test_type: testType,
                columns: columns,
                options: options
            }, { timeout: this.timeout });

            // Python returns { success, test_results: {...} }
            const raw = response.data.test_results || response.data;
            return {
                success: true,
                testResults: {
                    statistic: raw.statistic ?? response.data.statistic,
                    pValue: raw.p_value ?? raw.pValue ?? response.data.p_value,
                    criticalValue: raw.critical_value ?? response.data.critical_value,
                    testType: testType,
                    conclusion: raw.conclusion ?? response.data.conclusion,
                    details: raw
                }
            };
        } catch (error) {
            console.error('Error performing hypothesis testing:', error);
            throw new Error(`Failed to perform hypothesis testing: ${error.message}`);
        }
    }

    async anovaAnalysis(data, groupColumn, valueColumn) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/anova`, {
                data: data,
                group_column: groupColumn,
                value_column: valueColumn
            }, { timeout: this.timeout });

            return {
                success: true,
                anovaResults: {
                    fStatistic: response.data.f_statistic,
                    pValue: response.data.p_value,
                    dfBetween: response.data.df_between,
                    dfWithin: response.data.df_within,
                    sumSquaresBetween: response.data.ss_between,
                    sumSquaresWithin: response.data.ss_within,
                    meanSquareBetween: response.data.ms_between,
                    meanSquareWithin: response.data.ms_within
                }
            };
        } catch (error) {
            console.error('Error performing ANOVA:', error);
            throw new Error(`Failed to perform ANOVA: ${error.message}`);
        }
    }

    // Visualization Operations
    async createScatterPlot(data, xColumn, yColumn, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/scatter-plot`, {
                data: data,
                x_column: xColumn,
                y_column: yColumn,
                options: options
            }, { timeout: this.timeout });

            return {
                success: true,
                plot: {
                    imageData: response.data.image_data,
                    title: options.title || `${yColumn} vs ${xColumn}`,
                    xLabel: options.xLabel || xColumn,
                    yLabel: options.yLabel || yColumn
                }
            };
        } catch (error) {
            console.error('Error creating scatter plot:', error);
            throw new Error(`Failed to create scatter plot: ${error.message}`);
        }
    }

    async createHistogram(data, column, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/histogram`, {
                data: data,
                column: column,
                options: options
            }, { timeout: this.timeout });

            return {
                success: true,
                plot: {
                    imageData: response.data.image_data,
                    title: options.title || `Distribution of ${column}`,
                    bins: response.data.bins,
                    frequencies: response.data.frequencies
                }
            };
        } catch (error) {
            console.error('Error creating histogram:', error);
            throw new Error(`Failed to create histogram: ${error.message}`);
        }
    }

    async createBoxPlot(data, columns, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/box-plot`, {
                data: data,
                columns: columns,
                options: options
            }, { timeout: this.timeout });

            return {
                success: true,
                plot: {
                    imageData: response.data.image_data,
                    title: options.title || 'Box Plot',
                    statistics: response.data.statistics
                }
            };
        } catch (error) {
            console.error('Error creating box plot:', error);
            throw new Error(`Failed to create box plot: ${error.message}`);
        }
    }

    async createHeatmap(data, columns = null, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/heatmap`, {
                data: data,
                columns: columns,
                options: options
            }, { timeout: this.timeout });

            return {
                success: true,
                plot: {
                    imageData: response.data.image_data,
                    title: options.title || 'Correlation Heatmap',
                    correlationMatrix: response.data.correlation_matrix
                }
            };
        } catch (error) {
            console.error('Error creating heatmap:', error);
            throw new Error(`Failed to create heatmap: ${error.message}`);
        }
    }

    async createLineChart(data, xColumn, yColumn, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/line-chart`, {
                data: data,
                x_column: xColumn,
                y_column: yColumn,
                options: options
            }, { timeout: this.timeout });

            return {
                success: true,
                plot: {
                    imageData: response.data.image_data,
                    title: options.title || `${yColumn} over ${xColumn}`,
                    xLabel: options.xLabel || xColumn,
                    yLabel: options.yLabel || yColumn
                }
            };
        } catch (error) {
            console.error('Error creating line chart:', error);
            throw new Error(`Failed to create line chart: ${error.message}`);
        }
    }

    // Export Operations
    async exportToCSV(data, filePath, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/export-csv`, {
                data: data,
                file_path: filePath,
                options: {
                    delimiter: options.delimiter || ',',
                    header: options.header !== false,
                    index: options.index !== false,
                    ...options
                }
            }, { timeout: this.timeout });

            return {
                success: true,
                filePath: response.data.file_path,
                size: response.data.size
            };
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            throw new Error(`Failed to export to CSV: ${error.message}`);
        }
    }

    async exportToExcel(data, filePath, options = {}) {
        try {
            const response = await axios.post(`${this.pythonServiceUrl}/export-excel`, {
                data: data,
                file_path: filePath,
                options: {
                    sheet_name: options.sheetName || 'Sheet1',
                    header: options.header !== false,
                    index: options.index !== false,
                    ...options
                }
            }, { timeout: this.timeout });

            return {
                success: true,
                filePath: response.data.file_path,
                size: response.data.size
            };
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            throw new Error(`Failed to export to Excel: ${error.message}`);
        }
    }

    // Workflow Execution
    async executeWorkflow(workflowNodes, workflowConnections, dataSets = {}) {
        try {
            console.log('Executing statistical analysis workflow...');
            
            // Validate workflow
            this.validateWorkflow(workflowNodes, workflowConnections);
            
            // Execute nodes in topological order
            const executionOrder = this.getExecutionOrder(workflowNodes, workflowConnections);
            const results = {};
            
            for (const nodeId of executionOrder) {
                const node = workflowNodes.find(n => n.id === nodeId);
                if (!node) continue;
                
                console.log(`Executing node: ${node.widgetId}`);
                
                // Get input data from connected nodes
                const inputData = this.getNodeInputData(node, workflowConnections, results, dataSets);
                
                // Execute the node
                const nodeResult = await this.executeNode(node, inputData);
                results[nodeId] = nodeResult;
            }
            
            return {
                success: true,
                results: results,
                executionOrder: executionOrder
            };
            
        } catch (error) {
            console.error('Error executing workflow:', error);
            throw new Error(`Workflow execution failed: ${error.message}`);
        }
    }

    validateWorkflow(nodes, connections) {
        // Check for cycles
        const visited = new Set();
        const recursionStack = new Set();
        
        const hasCycle = (nodeId) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            
            const outgoingConnections = connections.filter(c => c.fromNode === nodeId);
            for (const conn of outgoingConnections) {
                if (!visited.has(conn.toNode)) {
                    if (hasCycle(conn.toNode)) return true;
                } else if (recursionStack.has(conn.toNode)) {
                    return true;
                }
            }
            
            recursionStack.delete(nodeId);
            return false;
        };
        
        for (const node of nodes) {
            if (!visited.has(node.id)) {
                if (hasCycle(node.id)) {
                    throw new Error('Workflow contains cycles');
                }
            }
        }
    }

    getExecutionOrder(nodes, connections) {
        // Topological sort
        const inDegree = {};
        const graph = {};
        
        // Initialize
        for (const node of nodes) {
            inDegree[node.id] = 0;
            graph[node.id] = [];
        }
        
        // Build graph and calculate in-degrees
        for (const conn of connections) {
            graph[conn.fromNode].push(conn.toNode);
            inDegree[conn.toNode]++;
        }
        
        // Find nodes with no incoming edges
        const queue = nodes.filter(node => inDegree[node.id] === 0).map(node => node.id);
        const result = [];
        
        while (queue.length > 0) {
            const current = queue.shift();
            result.push(current);
            
            for (const neighbor of graph[current]) {
                inDegree[neighbor]--;
                if (inDegree[neighbor] === 0) {
                    queue.push(neighbor);
                }
            }
        }
        
        if (result.length !== nodes.length) {
            throw new Error('Workflow contains cycles');
        }
        
        return result;
    }

    getNodeInputData(node, connections, results, dataSets) {
        const inputData = {};
        
        // Get connections to this node
        const incomingConnections = connections.filter(c => c.toNode === node.id);
        
        for (const conn of incomingConnections) {
            const sourceResult = results[conn.fromNode];
            if (sourceResult && sourceResult.outputs && sourceResult.outputs[conn.fromOutput]) {
                inputData[conn.toInput] = sourceResult.outputs[conn.fromOutput];
            }
        }
        
        // If no connections, check if it's a data source node
        if (Object.keys(inputData).length === 0 && node.widgetId.startsWith('data_')) {
            const dataSetId = node.inputs.dataSetId || 'default';
            if (dataSets[dataSetId]) {
                inputData.data = dataSets[dataSetId];
            }
        }
        
        return inputData;
    }

    async executeNode(node, inputData) {
        const { widgetId, inputs } = node;
        
        try {
            let result;
            
            switch (widgetId) {
                case 'csv_file':
                    result = await this.loadCSVData(inputs.filePath, inputs.options);
                    break;
                    
                case 'excel_file':
                    result = await this.loadExcelData(inputs.filePath, inputs.options);
                    break;
                    
                case 'data_info':
                    result = await this.getDataInfo(inputData.data);
                    break;
                    
                case 'select_columns':
                    result = await this.selectColumns(inputData.data, inputs.columns);
                    break;
                    
                case 'remove_duplicates':
                    result = await this.removeDuplicates(inputData.data, inputs.subset);
                    break;
                    
                case 'handle_missing':
                    result = await this.handleMissingValues(inputData.data, inputs.method, inputs.fillValue);
                    break;
                    
                case 'descriptive_stats':
                    result = await this.getDescriptiveStatistics(inputData.data, inputs.columns);
                    break;
                    
                case 'correlation_analysis':
                    result = await this.correlationAnalysis(inputData.data, inputs.method, inputs.columns);
                    break;
                    
                case 'linear_regression':
                    result = await this.linearRegression(inputData.data, inputs.targetColumn, inputs.featureColumns);
                    break;
                    
                case 'clustering':
                    result = await this.clusteringAnalysis(inputData.data, inputs.nClusters, inputs.algorithm, inputs.columns);
                    break;
                    
                case 'hypothesis_testing':
                    result = await this.hypothesisTesting(inputData.data, inputs.testType, inputs.columns, inputs.options);
                    break;
                    
                case 'anova':
                    result = await this.anovaAnalysis(inputData.data, inputs.groupColumn, inputs.valueColumn);
                    break;
                    
                case 'scatter_plot':
                    result = await this.createScatterPlot(inputData.data, inputs.xColumn, inputs.yColumn, inputs.options);
                    break;
                    
                case 'histogram':
                    result = await this.createHistogram(inputData.data, inputs.column, inputs.options);
                    break;
                    
                case 'box_plot':
                    result = await this.createBoxPlot(inputData.data, inputs.columns, inputs.options);
                    break;
                    
                case 'heatmap':
                    result = await this.createHeatmap(inputData.data, inputs.columns, inputs.options);
                    break;
                    
                case 'line_chart':
                    result = await this.createLineChart(inputData.data, inputs.xColumn, inputs.yColumn, inputs.options);
                    break;
                    
                case 'export_csv':
                    result = await this.exportToCSV(inputData.data, inputs.filePath, inputs.options);
                    break;
                    
                case 'export_excel':
                    result = await this.exportToExcel(inputData.data, inputs.filePath, inputs.options);
                    break;
                    
                default:
                    throw new Error(`Unknown widget type: ${widgetId}`);
            }
            
            return {
                ...result,
                nodeId: node.id,
                widgetId: widgetId,
                outputs: this.formatOutputs(widgetId, result)
            };
            
        } catch (error) {
            console.error(`Error executing node ${node.id}:`, error);
            return {
                success: false,
                error: error.message,
                nodeId: node.id,
                widgetId: widgetId
            };
        }
    }

    formatOutputs(widgetId, result) {
        const outputs = {};
        
        switch (widgetId) {
            case 'csv_file':
            case 'excel_file':
            case 'select_columns':
            case 'remove_duplicates':
            case 'handle_missing':
                outputs.data = result.data;
                break;
                
            case 'data_info':
                outputs.info = result.info;
                break;
                
            case 'descriptive_stats':
                outputs.stats = result.statistics;
                break;
                
            case 'correlation_analysis':
                outputs.correlation = result.correlation;
                break;
                
            case 'linear_regression':
                outputs.model = result.model;
                outputs.predictions = result.predictions;
                break;
                
            case 'clustering':
                outputs.clusters = result.clusters;
                break;
                
            case 'hypothesis_testing':
                outputs.test_results = result.testResults;
                break;
                
            case 'anova':
                outputs.anova_results = result.anovaResults;
                break;
                
            case 'scatter_plot':
            case 'histogram':
            case 'box_plot':
            case 'heatmap':
            case 'line_chart':
                outputs.plot = result.plot;
                break;
                
            case 'export_csv':
            case 'export_excel':
                outputs.file = result.filePath;
                break;
        }
        
        return outputs;
    }

    // Export Results Methods
    async exportResultsToCSV(results) {
        try {
            // Convert results to CSV format
            const csvData = this.convertResultsToCSV(results);
            return csvData;
        } catch (error) {
            console.error('Error exporting results to CSV:', error);
            throw new Error(`Failed to export results to CSV: ${error.message}`);
        }
    }

    async exportResultsToExcel(results) {
        try {
            // Convert results to Excel format
            const excelData = this.convertResultsToExcel(results);
            return excelData;
        } catch (error) {
            console.error('Error exporting results to Excel:', error);
            throw new Error(`Failed to export results to Excel: ${error.message}`);
        }
    }

    convertResultsToCSV(results) {
        const csvRows = [];
        
        // Add header
        csvRows.push('Node ID,Widget Type,Success,Error,Output Type,Output Data');
        
        // Add data rows
        Object.entries(results).forEach(([nodeId, result]) => {
            const success = result.success ? 'Yes' : 'No';
            const error = result.error || '';
            
            if (result.outputs) {
                Object.entries(result.outputs).forEach(([outputType, outputData]) => {
                    const dataStr = typeof outputData === 'object' 
                        ? JSON.stringify(outputData).replace(/,/g, ';') 
                        : String(outputData);
                    csvRows.push(`${nodeId},${result.widgetId},${success},${error},${outputType},${dataStr}`);
                });
            } else {
                csvRows.push(`${nodeId},${result.widgetId},${success},${error},,`);
            }
        });
        
        return csvRows.join('\n');
    }

    convertResultsToExcel(results) {
        // For now, return CSV format as Excel
        // In a real implementation, you would use a library like 'xlsx'
        return this.convertResultsToCSV(results);
    }

    // Health check
    async healthCheck() {
        try {
            const response = await axios.get(`${this.pythonServiceUrl}/health`, { timeout: 10000 });
            return {
                status: 'healthy',
                service: 'Advanced Statistical Analysis',
                timestamp: new Date().toISOString(),
                pythonService: response.data
            };
        } catch (error) {
            console.error('Advanced stats service health check failed:', error);
            return {
                status: 'unhealthy',
                error: 'Advanced statistical analysis service unavailable',
                timestamp: new Date().toISOString()
            };
        }
    }
}

export default AdvancedStatisticalService;
