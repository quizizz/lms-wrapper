declare class LMSError extends Error {
    /**
     * @param {string} message
     * @param {string} [type=error]
     * @param {Object} [cause=null] - extra data for debugging
     */
    constructor(message: string, type?: string, cause?: object);
    name: string;
    type: string;
    cause: any;
}
export default LMSError;