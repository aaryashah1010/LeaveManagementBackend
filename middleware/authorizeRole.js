// This middleware checks if the user's role matches the allowed roles
module.exports = function (...allowedRoles) {
    return (req, res, next) => {
        // req.user is set by your verifyToken middleware before this runs
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: 'Access denied: You do not have the required permissions' 
            });
        }
        next();
    };
};